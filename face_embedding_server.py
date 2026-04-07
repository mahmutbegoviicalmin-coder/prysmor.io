"""
VFXPilot Face Embedding Server v1
==================================
Persistent FastAPI sidecar on localhost:7788

Models
------
  Primary   : InsightFace buffalo_sc  — 512-dim ArcFace embeddings
                (bright / normal frames)
  Secondary : AdaFace IR-50 (HuggingFace minchul/cvlface_adaface_ir50_webface4m_5folds)
                (dark / motion-blur / profile frames)
              Falls back to CLAHE + InsightFace buffalo_l if AdaFace unavailable.

Endpoints
---------
  GET  /health
  POST /embed         { image: base64 }          → EmbedResult
  POST /embed_batch   { images: base64[] }        → { results: [...] }
  POST /detect        { image: base64 }           → DetectResult
  POST /enhance       { image: base64 }           → { image: base64 }
  POST /quality       { image: base64 }           → { type: str, score: float }

Dependencies (pip install)
--------------------------
  insightface fastapi uvicorn opencv-python numpy torch torchvision
  huggingface_hub Pillow
"""

from __future__ import annotations

import base64
import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from io import BytesIO
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("face_embed")

app = FastAPI(title="VFXPilot Face Embedding Server", version="1.0.0")

# ─── Configuration constants ──────────────────────────────────────────────────

SIDECAR_PORT         = 7788
EMBEDDING_DIM        = 512

# CLAHE
CLAHE_CLIP_LIMIT     = 2.0
CLAHE_TILE_GRID      = (8, 8)

# Quality classification thresholds
LUM_DARK_THRESHOLD   = 60    # mean luminance below → dark
BLUR_LAPLACIAN_THR   = 80    # Laplacian variance below → motion_blur
PROFILE_YAW_DEG      = 30.0  # pose yaw above → profile
OCCLUDED_CONF_THR    = 0.55  # det_score below → occluded

# Face crop padding (20% margin before resize)
FACE_MARGIN_FRAC     = 0.20

# Blend weights when both models have confidence > 0.5
BLEND_PRIMARY_W      = 0.6
BLEND_SECONDARY_W    = 0.4

# ─── Global model state ───────────────────────────────────────────────────────

_insight_app: Any       = None   # InsightFace FaceAnalysis (buffalo_sc)
_insight_l_app: Any     = None   # InsightFace FaceAnalysis (buffalo_l) — secondary fallback
_adaface_net: Any       = None   # AdaFace IR-50 PyTorch model or None
_adaface_device: str    = "cpu"
_adaface_available: bool = False
_models_ready: bool     = False
_load_error: Optional[str] = None


# ─── Image helpers ────────────────────────────────────────────────────────────

def decode_image(b64: str) -> np.ndarray:
    """Decode base64 (or data-URI) to BGR uint8 numpy array."""
    try:
        if "," in b64:
            b64 = b64.split(",", 1)[1]
        raw  = base64.b64decode(b64)
        arr  = np.frombuffer(raw, dtype=np.uint8)
        img  = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("cv2.imdecode returned None")
        return img
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image: {exc}") from exc


def encode_image(img: np.ndarray) -> str:
    """Encode BGR numpy array to base64 JPEG string."""
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 95])
    if not ok:
        raise ValueError("Failed to encode image")
    return base64.b64encode(buf.tobytes()).decode("utf-8")


# ─── CLAHE enhancement ────────────────────────────────────────────────────────

def apply_clahe(img_bgr: np.ndarray) -> np.ndarray:
    """CLAHE on L channel of LAB colour space for dark-frame enhancement."""
    lab  = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    clahe = cv2.createCLAHE(clipLimit=CLAHE_CLIP_LIMIT, tileGridSize=CLAHE_TILE_GRID)
    lab[:, :, 0] = clahe.apply(lab[:, :, 0])
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)


# ─── ArcFace face alignment (standard 112×112) ───────────────────────────────

# Reference landmarks for a canonical 112×112 frontal face
_ARCFACE_REF_PTS = np.float32([
    [38.2946, 51.6963],
    [73.5318, 51.5014],
    [56.0252, 71.7366],
    [41.5493, 92.3655],
    [70.7299, 92.2041],
])


def align_face(img_bgr: np.ndarray, kps: np.ndarray, output_size: int = 112) -> np.ndarray:
    """Warp face to canonical ArcFace pose using 5 facial landmarks."""
    scale    = output_size / 112.0
    ref_pts  = _ARCFACE_REF_PTS * scale
    src_pts  = np.float32(kps[:5])
    M, _     = cv2.estimateAffinePartial2D(src_pts, ref_pts)
    if M is None:
        return cv2.resize(img_bgr, (output_size, output_size))
    return cv2.warpAffine(img_bgr, M, (output_size, output_size))


# ─── Crop face with 20% margin ────────────────────────────────────────────────

def crop_face_with_margin(img_bgr: np.ndarray, bbox: np.ndarray) -> np.ndarray:
    """Crop the face region with 20% padding on all sides, padded to square."""
    h, w = img_bgr.shape[:2]
    x1, y1, x2, y2 = bbox
    bw = x2 - x1
    bh = y2 - y1
    mx = bw * FACE_MARGIN_FRAC
    my = bh * FACE_MARGIN_FRAC
    cx1 = max(0, int(x1 - mx))
    cy1 = max(0, int(y1 - my))
    cx2 = min(w, int(x2 + mx))
    cy2 = min(h, int(y2 + my))
    crop = img_bgr[cy1:cy2, cx1:cx2]
    # Pad to square
    ch, cw = crop.shape[:2]
    side = max(ch, cw)
    pad  = np.zeros((side, side, 3), dtype=np.uint8)
    off_y = (side - ch) // 2
    off_x = (side - cw) // 2
    pad[off_y:off_y + ch, off_x:off_x + cw] = crop
    return pad


# ─── AdaFace IResNet-50 architecture ─────────────────────────────────────────

def _build_iresnet50() -> Any:
    """
    Minimal IResNet-50 compatible with AdaFace checkpoints.
    Input: 3×112×112, output: 512-dim L2-normalised embedding.
    """
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    class IBasicBlock(nn.Module):
        expansion: int = 1

        def __init__(
            self,
            inplanes: int,
            planes: int,
            stride: int = 1,
            downsample: Optional[nn.Module] = None,
        ) -> None:
            super().__init__()
            self.bn1   = nn.BatchNorm2d(inplanes, eps=1e-05)
            self.conv1 = nn.Conv2d(inplanes, planes, 3, stride=1, padding=1, bias=False)
            self.bn2   = nn.BatchNorm2d(planes, eps=1e-05)
            self.prelu = nn.PReLU(planes)
            self.conv2 = nn.Conv2d(planes, planes, 3, stride=stride, padding=1, bias=False)
            self.bn3   = nn.BatchNorm2d(planes, eps=1e-05)
            self.downsample = downsample
            self.stride = stride

        def forward(self, x: Any) -> Any:
            residual = x
            out = self.bn1(x)
            out = self.conv1(out)
            out = self.bn2(out)
            out = self.prelu(out)
            out = self.conv2(out)
            out = self.bn3(out)
            if self.downsample is not None:
                residual = self.downsample(x)
            out += residual
            return out

    class IResNet(nn.Module):
        def __init__(self, layers: List[int], dropout: float = 0.0, num_features: int = 512) -> None:
            super().__init__()
            self.inplanes = 64
            self.conv1  = nn.Conv2d(3, 64, kernel_size=3, stride=1, padding=1, bias=False)
            self.bn1    = nn.BatchNorm2d(64, eps=1e-05)
            self.prelu  = nn.PReLU(64)
            self.layer1 = self._make_layer(IBasicBlock, 64,  layers[0], stride=2)
            self.layer2 = self._make_layer(IBasicBlock, 128, layers[1], stride=2)
            self.layer3 = self._make_layer(IBasicBlock, 256, layers[2], stride=2)
            self.layer4 = self._make_layer(IBasicBlock, 512, layers[3], stride=2)
            self.bn2    = nn.BatchNorm2d(512, eps=1e-05)
            self.dropout = nn.Dropout(p=dropout)
            self.fc     = nn.Linear(512 * 7 * 7, num_features)
            self.features = nn.BatchNorm1d(num_features, eps=1e-05)
            nn.init.constant_(self.features.weight, 1.0)
            self.features.weight.requires_grad = False

        def _make_layer(
            self, block: type, planes: int, blocks: int, stride: int = 1
        ) -> nn.Sequential:
            downsample = None
            if stride != 1 or self.inplanes != planes * block.expansion:
                downsample = nn.Sequential(
                    nn.Conv2d(self.inplanes, planes * block.expansion, 1, stride=stride, bias=False),
                    nn.BatchNorm2d(planes * block.expansion, eps=1e-05),
                )
            layers_list = [block(self.inplanes, planes, stride, downsample)]
            self.inplanes = planes * block.expansion
            for _ in range(1, blocks):
                layers_list.append(block(self.inplanes, planes))
            return nn.Sequential(*layers_list)

        def forward(self, x: Any) -> Any:
            x = self.conv1(x)
            x = self.bn1(x)
            x = self.prelu(x)
            x = self.layer1(x)
            x = self.layer2(x)
            x = self.layer3(x)
            x = self.layer4(x)
            x = self.bn2(x)
            x = self.dropout(x)
            x = x.flatten(1)
            x = self.fc(x)
            x = self.features(x)
            return F.normalize(x, p=2, dim=1)

    # IR-50: [3, 4, 14, 3]
    return IResNet(layers=[3, 4, 14, 3], dropout=0.4, num_features=EMBEDDING_DIM)


# ─── Model loading ────────────────────────────────────────────────────────────

def _load_insightface() -> None:
    global _insight_app, _insight_l_app
    from insightface.app import FaceAnalysis
    providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    fa_sc = FaceAnalysis(name="buffalo_sc", providers=providers)
    fa_sc.prepare(ctx_id=0, det_size=(640, 640))
    _insight_app = fa_sc
    log.info("InsightFace buffalo_sc ready (primary)")
    try:
        fa_l = FaceAnalysis(name="buffalo_l", providers=providers)
        fa_l.prepare(ctx_id=0, det_size=(640, 640))
        _insight_l_app = fa_l
        log.info("InsightFace buffalo_l ready (secondary fallback)")
    except Exception as exc:
        log.warning(f"buffalo_l not available ({exc}); only buffalo_sc loaded")


def _load_adaface() -> None:
    global _adaface_net, _adaface_device, _adaface_available
    try:
        import torch
        from huggingface_hub import hf_hub_download

        log.info("Downloading AdaFace IR-50 checkpoint from HuggingFace…")
        ckpt_path = hf_hub_download(
            repo_id="minchul/cvlface_adaface_ir50_webface4m_5folds",
            filename="adaface_ir50_webface4m.ckpt",
        )
        log.info(f"AdaFace checkpoint at: {ckpt_path}")

        net = _build_iresnet50()

        checkpoint = torch.load(ckpt_path, map_location="cpu", weights_only=False)
        if isinstance(checkpoint, dict) and "state_dict" in checkpoint:
            sd = checkpoint["state_dict"]
            # Strip 'model.' prefix added by AdaFace's Lightning wrapper
            sd = {(k[6:] if k.startswith("model.") else k): v for k, v in sd.items()}
        elif isinstance(checkpoint, dict):
            sd = checkpoint
        else:
            raise ValueError("Unrecognised checkpoint format")

        missing, unexpected = net.load_state_dict(sd, strict=False)
        if missing:
            log.warning(f"AdaFace: {len(missing)} missing keys in state dict")
        net.eval()

        device = "cuda" if torch.cuda.is_available() else "cpu"
        net    = net.to(device)

        _adaface_net       = net
        _adaface_device    = device
        _adaface_available = True
        log.info(f"AdaFace IR-50 ready on {device}")

    except Exception as exc:
        log.warning(
            f"AdaFace loading failed ({exc!r}). "
            "Secondary path will use CLAHE + buffalo_l / buffalo_sc."
        )
        _adaface_net       = None
        _adaface_available = False


@app.on_event("startup")
async def on_startup() -> None:
    global _models_ready, _load_error
    log.info("Loading face embedding models…")
    try:
        _load_insightface()
    except Exception as exc:
        _load_error = f"InsightFace failed: {exc}"
        log.error(_load_error)
        return

    try:
        _load_adaface()
    except Exception as exc:
        log.warning(f"AdaFace startup error: {exc}")

    _models_ready = True
    log.info(
        f"Models ready — InsightFace: {_insight_app is not None}, "
        f"AdaFace: {_adaface_available}"
    )


# ─── Low-level embedding helpers ─────────────────────────────────────────────

def _embed_with_insight(
    img_bgr: np.ndarray, app_instance: Any
) -> Tuple[Optional[np.ndarray], float]:
    """Run an InsightFace FaceAnalysis instance; return (normed_embedding, det_score)."""
    if app_instance is None:
        return None, 0.0
    faces = app_instance.get(img_bgr)
    if not faces:
        return None, 0.0
    face = max(faces, key=lambda f: float(f.det_score))
    return face.normed_embedding.astype(np.float32), float(face.det_score)


def _embed_with_adaface(
    img_bgr: np.ndarray, det_faces: list
) -> Tuple[Optional[np.ndarray], float]:
    """
    Run AdaFace IR-50 on the best detected face.
    Returns (L2-normed 512-dim embedding, det_score).
    Falls back to CLAHE+buffalo_l if AdaFace weights unavailable.
    """
    if not _adaface_available or _adaface_net is None:
        # Fallback: CLAHE + buffalo_l (or buffalo_sc if l unavailable)
        enhanced = apply_clahe(img_bgr)
        secondary_app = _insight_l_app if _insight_l_app is not None else _insight_app
        return _embed_with_insight(enhanced, secondary_app)

    if not det_faces:
        return None, 0.0

    import torch

    face     = max(det_faces, key=lambda f: float(f.det_score))
    det_conf = float(face.det_score)

    # Align to canonical 112×112
    aligned = align_face(img_bgr, face.kps)

    # Normalise to [-1, 1] (AdaFace training preprocessing)
    rgb = cv2.cvtColor(aligned, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    rgb = (rgb - 0.5) / 0.5
    t   = torch.from_numpy(rgb.transpose(2, 0, 1)).unsqueeze(0).to(_adaface_device)

    with torch.no_grad():
        emb = _adaface_net(t).cpu().numpy()[0].astype(np.float32)  # already L2-normed

    return emb, det_conf


# ─── Quality classification ───────────────────────────────────────────────────

QualityType = str  # 'bright' | 'dark' | 'motion_blur' | 'profile' | 'occluded'


def classify_quality(img_bgr: np.ndarray, det_faces: list) -> Tuple[QualityType, float]:
    """Classify frame quality for model-selection routing."""
    gray     = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    mean_lum = float(gray.mean())

    # Dark check
    if mean_lum < LUM_DARK_THRESHOLD:
        score = max(0.0, 1.0 - mean_lum / LUM_DARK_THRESHOLD)
        return "dark", round(score, 4)

    # Motion blur (Laplacian variance)
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    if lap_var < BLUR_LAPLACIAN_THR:
        score = max(0.0, 1.0 - lap_var / BLUR_LAPLACIAN_THR)
        return "motion_blur", round(score, 4)

    if det_faces:
        face = max(det_faces, key=lambda f: float(f.det_score))

        # Profile check via InsightFace pose estimation
        if hasattr(face, "pose") and face.pose is not None:
            yaw = abs(float(face.pose[1]))
            if yaw > PROFILE_YAW_DEG:
                score = min(1.0, (yaw - PROFILE_YAW_DEG) / 60.0)
                return "profile", round(score, 4)

        # Occluded check via low detection confidence
        if float(face.det_score) < OCCLUDED_CONF_THR:
            return "occluded", round(1.0 - float(face.det_score), 4)
    else:
        # No face found at all → likely occluded
        return "occluded", 0.90

    # Normal bright frame
    score = min(1.0, (mean_lum - LUM_DARK_THRESHOLD) / (255.0 - LUM_DARK_THRESHOLD))
    return "bright", round(score, 4)


# ─── Core embed logic ─────────────────────────────────────────────────────────

def _embed_image(img_bgr: np.ndarray) -> dict:  # type: ignore[return]
    """
    Compute face embedding using the dual-model strategy.
    Returns dict matching EmbedResult schema.
    Raises HTTPException if no face is detected.
    """
    if not _models_ready or _insight_app is None:
        raise HTTPException(503, "Models not ready")

    # Detect faces for quality and secondary model
    det_faces = _insight_app.get(img_bgr)
    q_type, q_score = classify_quality(img_bgr, det_faces)

    use_secondary = q_type in ("dark", "motion_blur", "profile")

    if use_secondary:
        proc_img = apply_clahe(img_bgr) if q_type == "dark" else img_bgr
        emb_sec, conf_sec = _embed_with_adaface(proc_img, det_faces)
        emb_pri, conf_pri = _embed_with_insight(img_bgr, _insight_app)
        model_used = "adaface"

        # Blend if both embeddings are available and confident
        if (
            emb_sec is not None
            and emb_pri is not None
            and conf_sec > 0.5
            and conf_pri > 0.5
        ):
            blended = BLEND_PRIMARY_W * emb_sec + BLEND_SECONDARY_W * emb_pri
            norm    = float(np.linalg.norm(blended))
            if norm > 1e-8:
                blended /= norm
            return {
                "embedding":    blended.tolist(),
                "confidence":   round(max(conf_sec, conf_pri), 4),
                "model":        "blended",
                "quality_type": q_type,
                "quality_score": q_score,
            }

        emb, conf = (emb_sec, conf_sec) if emb_sec is not None else (emb_pri, conf_pri)
    else:
        emb, conf = _embed_with_insight(img_bgr, _insight_app)
        model_used = "insightface"

    if emb is None:
        raise HTTPException(422, "No face detected in image")

    return {
        "embedding":    emb.tolist(),
        "confidence":   round(float(conf), 4),
        "model":        model_used,
        "quality_type": q_type,
        "quality_score": q_score,
    }


# ─── Pydantic schemas ─────────────────────────────────────────────────────────

class EmbedRequest(BaseModel):
    image: str  # base64


class EmbedBatchRequest(BaseModel):
    images: List[str]


class DetectRequest(BaseModel):
    image: str


class EnhanceRequest(BaseModel):
    image: str


class QualityRequest(BaseModel):
    image: str


# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict:  # type: ignore[return]
    status = "ok" if _models_ready else ("loading" if _load_error is None else "error")
    return {
        "status":         status,
        "insightface":    _insight_app is not None,
        "buffalo_l":      _insight_l_app is not None,
        "adaface":        _adaface_available,
        "adaface_device": _adaface_device,
        "error":          _load_error,
    }


@app.post("/embed")
def embed(req: EmbedRequest) -> dict:  # type: ignore[return]
    img = decode_image(req.image)
    return _embed_image(img)


@app.post("/embed_batch")
def embed_batch(req: EmbedBatchRequest) -> dict:  # type: ignore[return]
    if not _models_ready:
        raise HTTPException(503, "Models not ready")
    results = []
    for b64 in req.images:
        try:
            results.append(_embed_image(decode_image(b64)))
        except HTTPException as exc:
            results.append({"error": exc.detail, "embedding": None, "confidence": 0.0})
        except Exception as exc:
            results.append({"error": str(exc), "embedding": None, "confidence": 0.0})
    return {"results": results}


@app.post("/detect")
def detect(req: DetectRequest) -> dict:  # type: ignore[return]
    if not _models_ready or _insight_app is None:
        raise HTTPException(503, "Models not ready")
    img      = decode_image(req.image)
    h, w     = img.shape[:2]
    raw_faces = _insight_app.get(img)
    faces_out = []

    for face in raw_faces:
        bbox = face.bbox  # [x1,y1,x2,y2] pixel
        x1   = max(0.0, float(bbox[0]) / w)
        y1   = max(0.0, float(bbox[1]) / h)
        x2   = min(1.0, float(bbox[2]) / w)
        y2   = min(1.0, float(bbox[3]) / h)
        kps  = []
        if face.kps is not None:
            for pt in face.kps:
                kps.append([float(pt[0]) / w, float(pt[1]) / h])
        faces_out.append({
            "box":        [x1, y1, x2, y2],
            "landmarks":  kps,
            "confidence": round(float(face.det_score), 4),
        })

    faces_out.sort(key=lambda f: f["confidence"], reverse=True)
    return {"faces": faces_out}


@app.post("/enhance")
def enhance(req: EnhanceRequest) -> dict:  # type: ignore[return]
    img = decode_image(req.image)
    return {"image": encode_image(apply_clahe(img))}


@app.post("/quality")
def quality(req: QualityRequest) -> dict:  # type: ignore[return]
    img      = decode_image(req.image)
    faces    = _insight_app.get(img) if (_insight_app and _models_ready) else []
    q_type, q_score = classify_quality(img, faces)
    return {"type": q_type, "score": q_score}


@app.post("/shutdown")
def shutdown() -> dict:
    """Called by the panel on unload — cleanly exits the sidecar process."""
    import threading
    def _exit():
        import time
        time.sleep(0.2)
        os._exit(0)
    threading.Thread(target=_exit, daemon=True).start()
    return {"ok": True}


# ─── Video trim + upload endpoint ─────────────────────────────────────────────

class TrimUploadRequest(BaseModel):
    file_path:    str
    media_in_sec: float = 0.0
    clip_dur_sec: float = 8.0
    upload_url:   str
    fields:       Dict[str, str] = {}


def _find_ffmpeg() -> str:
    """Return path to ffmpeg — checks next to script, bundled npm, then system PATH."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        # 1. ffmpeg.exe/ffmpeg placed directly next to face_embedding_server.py
        os.path.join(script_dir, "ffmpeg.exe"),
        os.path.join(script_dir, "ffmpeg"),
        # 2. Bundled via npm @ffmpeg-installer (when running from project root)
        os.path.join(script_dir, "node_modules", "@ffmpeg-installer", "win32-x64", "ffmpeg.exe"),
        os.path.join(script_dir, "node_modules", "@ffmpeg-installer", "linux-x64", "ffmpeg"),
        os.path.join(script_dir, "node_modules", "@ffmpeg-installer", "darwin-x64", "ffmpeg"),
        os.path.join(script_dir, "node_modules", "@ffmpeg-installer", "darwin-arm64", "ffmpeg"),
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c
    # 3. Fall back to system ffmpeg in PATH
    found = shutil.which("ffmpeg")
    if found:
        return found
    raise RuntimeError("ffmpeg not found — place ffmpeg.exe next to face_embedding_server.py or install system ffmpeg")


@app.post("/trim-upload")
def trim_upload(req: TrimUploadRequest) -> dict:
    """
    1. Trim req.file_path to [media_in_sec, media_in_sec + clip_dur_sec]
       using ffmpeg (fast seek, no re-encode for speed, re-encode to strip audio).
    2. Upload the trimmed file directly to the S3 pre-signed URL (req.upload_url)
       using the provided form fields.
    3. Return { success: true, size_bytes: int }.
    """
    if not os.path.isfile(req.file_path):
        raise HTTPException(400, f"File not found: {req.file_path}")

    dur = max(0.5, min(req.clip_dur_sec, 16.0))  # clamp 0.5-16 s

    tmp_out = tempfile.mktemp(suffix=".mp4", prefix="prysmor-trim-")
    try:
        ffmpeg = _find_ffmpeg()
        log.info("ffmpeg: %s  in=%s ss=%.3f dur=%.3f", ffmpeg, req.file_path, req.media_in_sec, dur)

        cmd = [
            ffmpeg, "-y",
            "-ss", str(req.media_in_sec),   # fast seek BEFORE input
            "-i", req.file_path,
            "-t", str(dur),
            "-an",                           # strip audio
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "28",                    # ~3-8 MB for 4-8s clip
            "-vf", "scale=min(1920\\,iw):min(1080\\,ih):force_original_aspect_ratio=decrease",
            "-movflags", "+faststart",
            "-pix_fmt", "yuv420p",
            tmp_out,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            log.error("ffmpeg stderr: %s", result.stderr[-800:])
            raise HTTPException(500, f"ffmpeg failed (code {result.returncode}): {result.stderr[-300:]}")

        size = os.path.getsize(tmp_out)
        log.info("Trimmed clip: %d bytes  →  uploading to S3", size)

        # Upload to pre-signed S3 URL using multipart/form-data
        import email.mime.multipart
        boundary = "----PrysmorBoundary"
        body_parts = []

        # Form fields must come before the file
        for k, v in req.fields.items():
            body_parts.append(
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{k}"\r\n\r\n'
                f"{v}\r\n"
            )

        with open(tmp_out, "rb") as fh:
            file_bytes = fh.read()

        file_header = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="clip.mp4"\r\n'
            f"Content-Type: video/mp4\r\n\r\n"
        )
        closing = f"\r\n--{boundary}--\r\n"

        body = b"".join(
            p.encode() for p in body_parts
        ) + file_header.encode() + file_bytes + closing.encode()

        upload_req = urllib.request.Request(
            req.upload_url,
            data=body,
            method="POST",
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )
        try:
            with urllib.request.urlopen(upload_req, timeout=120) as resp:
                status_code = resp.status
        except urllib.error.HTTPError as e:
            err_body = e.read().decode(errors="replace")
            log.error("S3 upload error %d: %s", e.code, err_body[:300])
            raise HTTPException(502, f"S3 upload failed {e.code}: {err_body[:200]}")

        log.info("S3 upload done — status %d", status_code)
        return {"success": True, "size_bytes": size, "status": status_code}

    finally:
        try:
            if os.path.isfile(tmp_out):
                os.unlink(tmp_out)
        except Exception:
            pass


# ─── Local Identity Lock compositing pipeline ─────────────────────────────────
#
# Runs entirely on the user's machine — no Vercel, no cloud.
# Called by the CEP panel after Runway generation completes.
#
# Steps:
#   1. Trim original clip with ffmpeg
#   2. Download Runway-generated video
#   3. Clean artifacts (deband + yadif)
#   4. Upscale generated video to original resolution (Runway outputs 1280×720)
#   5. Quick identity check via InsightFace cosine similarity
#      - similarity >= threshold → RAW_ACCEPT (faces preserved, skip compositing)
#      - similarity <  threshold → FACE_HEAD_RESTORE (composite orig face back)
#   6. Per-frame compositing with feathered face-zone blending
#   7. Reassemble with original audio via ffmpeg
#   8. Return local output path to the panel

COMPOSITE_RAW_ACCEPT_THRESHOLD = 0.75  # cosine similarity; above → no compositing needed
COMPOSITE_FPS_MAX              = 30    # hard cap — never exceed 30fps for compositing
COMPOSITE_FACE_EXPAND_X        = 0.20  # horizontal face-box expansion fraction
COMPOSITE_FACE_EXPAND_Y        = 0.25  # vertical   face-box expansion fraction
COMPOSITE_FEATHER_PX           = 18    # Gaussian feather radius for blend edge


class CompositeRequest(BaseModel):
    orig_path:    str
    media_in_sec: float = 0.0
    clip_dur_sec: float = 8.0
    generated_url: str
    job_id:       str = ""


# ── ffprobe helper ─────────────────────────────────────────────────────────────

def _probe_video(video_path: str) -> Dict[str, Any]:
    """Return {width, height, fps, duration} via ffprobe; safe defaults on failure."""
    ffprobe: Optional[str] = shutil.which("ffprobe")
    if not ffprobe:
        ffmpeg_path = _find_ffmpeg()
        candidate = ffmpeg_path.replace("ffmpeg.exe", "ffprobe.exe").replace("ffmpeg", "ffprobe")
        if os.path.isfile(candidate):
            ffprobe = candidate
    if not ffprobe:
        return {"width": 1280, "height": 720, "fps": 24.0, "duration": 4.0}
    try:
        result = subprocess.run(
            [ffprobe, "-v", "quiet", "-print_format", "json",
             "-show_streams", "-show_format", video_path],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr)
        data   = json.loads(result.stdout)
        vs     = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), {})
        w      = int(vs.get("width",  1280))
        h      = int(vs.get("height", 720))
        fps_s  = vs.get("r_frame_rate", "24/1")
        num, den = fps_s.split("/")
        fps    = float(num) / float(den) if float(den) > 0 else 24.0
        dur    = float(data.get("format", {}).get("duration", 4.0))
        return {"width": w, "height": h, "fps": fps, "duration": dur}
    except Exception as exc:
        log.warning("ffprobe failed (%s) — using defaults", exc)
        return {"width": 1280, "height": 720, "fps": 24.0, "duration": 4.0}


# ── Internal helpers ───────────────────────────────────────────────────────────

def _run_ffmpeg_cmd(cmd: List[str]) -> None:
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed (code {result.returncode}): {result.stderr[-300:]}")


def _download_video(url: str, dest: str) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "PrysmorSidecar/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp, open(dest, "wb") as fh:
        while True:
            chunk = resp.read(65536)
            if not chunk:
                break
            fh.write(chunk)


def _extract_frames(video_path: str, out_dir: str, fps: float) -> List[str]:
    os.makedirs(out_dir, exist_ok=True)
    ff = _find_ffmpeg()
    _run_ffmpeg_cmd([
        ff, "-y", "-i", video_path,
        "-vf", f"fps={fps}",
        "-q:v", "1",          # highest JPEG quality (was 2)
        os.path.join(out_dir, "frame-%04d.jpg"),
    ])
    return sorted(f for f in os.listdir(out_dir) if f.endswith(".jpg"))


def _clean_artifacts(video_path: str) -> None:
    """deband + yadif in-place; non-fatal on failure."""
    tmp = video_path + ".clean.mp4"
    try:
        _run_ffmpeg_cmd([
            _find_ffmpeg(), "-y", "-i", video_path,
            "-vf", (
                "deband=1thr=0.03:2thr=0.03:3thr=0.03:4thr=0.015"
                ":range=22:direction=random:blur=true,"
                "yadif=mode=0:deint=all"
            ),
            "-c:v", "libx264", "-crf", "17", "-preset", "fast",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", tmp,
        ])
        os.replace(tmp, video_path)
    except Exception as exc:
        log.warning("Artifact cleaning failed (non-fatal): %s", exc)
        if os.path.isfile(tmp):
            try: os.unlink(tmp)
            except Exception: pass


def _upscale_video(inp: str, out: str, w: int, h: int) -> None:
    _run_ffmpeg_cmd([
        _find_ffmpeg(), "-y", "-i", inp,
        "-vf", (
            f"scale={w}:{h}:flags=lanczos:force_original_aspect_ratio=decrease,"
            f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:black,"
            "crop=trunc(iw/2)*2:trunc(ih/2)*2"
        ),
        "-c:v", "libx264", "-crf", "15", "-preset", "fast",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", out,
    ])


def _extract_single_frame(video_path: str, at_sec: float, out_path: str) -> bool:
    try:
        _run_ffmpeg_cmd([
            _find_ffmpeg(), "-y",
            "-ss", str(at_sec), "-i", video_path,
            "-vframes", "1", "-q:v", "2", out_path,
        ])
        return os.path.isfile(out_path)
    except Exception:
        return False


def _face_embedding_from_file(img_path: str) -> Optional[np.ndarray]:
    if not (_models_ready and _insight_app):
        return None
    try:
        img = cv2.imread(img_path)
        if img is None:
            return None
        result = _embed_image(img)
        return np.array(result["embedding"], dtype=np.float32)
    except Exception:
        return None


def _face_bbox_from_file(img_path: str) -> Optional[Tuple[int, int, int, int]]:
    if not (_models_ready and _insight_app):
        return None
    try:
        img = cv2.imread(img_path)
        if img is None:
            return None
        faces = _insight_app.get(img)
        if not faces:
            return None
        face = max(faces, key=lambda f: float(f.det_score))
        b = face.bbox.astype(int)
        return (int(b[0]), int(b[1]), int(b[2]), int(b[3]))
    except Exception:
        return None


def _cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = float(np.linalg.norm(a)), float(np.linalg.norm(b))
    if na < 1e-8 or nb < 1e-8:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


def _composite_frame_face(
    orig_path: str,
    gen_path:  str,
    face_bbox: Optional[Tuple[int, int, int, int]],
    w: int, h: int,
) -> np.ndarray:
    """Blend original face zone over generated frame with feathering."""
    orig = cv2.imread(orig_path)
    gen  = cv2.imread(gen_path)
    if orig is None or gen is None:
        return gen if gen is not None else (orig if orig is not None else np.zeros((h, w, 3), np.uint8))
    if orig.shape[:2] != (h, w):
        orig = cv2.resize(orig, (w, h), interpolation=cv2.INTER_LANCZOS4)
    if gen.shape[:2] != (h, w):
        gen  = cv2.resize(gen,  (w, h), interpolation=cv2.INTER_LANCZOS4)
    if face_bbox is None:
        return gen
    x1, y1, x2, y2 = face_bbox
    bw, bh = x2 - x1, y2 - y1
    ex, ey = int(bw * COMPOSITE_FACE_EXPAND_X), int(bh * COMPOSITE_FACE_EXPAND_Y)
    x1 = max(0, x1 - ex);  y1 = max(0, y1 - ey)
    x2 = min(w, x2 + ex);  y2 = min(h, y2 + ey)
    mask = np.zeros((h, w), dtype=np.float32)
    mask[y1:y2, x1:x2] = 1.0
    k = COMPOSITE_FEATHER_PX * 2 + 1
    mask = cv2.GaussianBlur(mask, (k, k), COMPOSITE_FEATHER_PX * 0.5)
    m3   = np.stack([mask, mask, mask], axis=2)
    return (orig.astype(np.float32) * m3 + gen.astype(np.float32) * (1.0 - m3)).astype(np.uint8)


def _reassemble_video(frames_dir: str, orig_path: str, out_path: str, fps: float) -> None:
    _run_ffmpeg_cmd([
        _find_ffmpeg(), "-y",
        "-framerate", str(fps),
        "-i", os.path.join(frames_dir, "comp-%04d.jpg"),
        "-i", orig_path,
        "-map", "0:v:0", "-map", "1:a:0?",
        "-c:v", "libx264", "-crf", "14", "-preset", "medium",  # higher quality (was crf 17, fast)
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest",
        "-movflags", "+faststart", out_path,
    ])


# ── /composite endpoint ────────────────────────────────────────────────────────

@app.post("/composite")
def composite(req: CompositeRequest) -> dict:  # type: ignore[return]
    if not os.path.isfile(req.orig_path):
        raise HTTPException(400, f"Source file not found: {req.orig_path}")

    dur      = max(0.5, min(req.clip_dur_sec, 16.0))
    job_id   = req.job_id or str(int(time.time() * 1000))
    work_dir = tempfile.mkdtemp(prefix=f"prysmor-comp-{job_id}-")
    t_start  = time.time()

    log.info("=== Composite job %s start ===", job_id)
    log.info("orig=%s  ss=%.3f  dur=%.3f", req.orig_path, req.media_in_sec, dur)

    try:
        ff = _find_ffmpeg()

        # ── 1. Trim original ──────────────────────────────────────────────────
        orig_trimmed = os.path.join(work_dir, "orig.mp4")
        _run_ffmpeg_cmd([
            ff, "-y",
            "-ss", str(req.media_in_sec), "-i", req.orig_path,
            "-t", str(dur),
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "17",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", orig_trimmed,
        ])
        log.info("Trim done → %s", orig_trimmed)

        # ── 2. Download generated video ───────────────────────────────────────
        gen_video = os.path.join(work_dir, "generated.mp4")
        log.info("Downloading: %s…", req.generated_url[:80])
        _download_video(req.generated_url, gen_video)
        log.info("Download done (%d bytes)", os.path.getsize(gen_video))

        # ── 3. Clean Runway artifacts ─────────────────────────────────────────
        log.info("Cleaning artifacts…")
        _clean_artifacts(gen_video)

        # ── 4. Probe + upscale if needed ──────────────────────────────────────
        orig_info = _probe_video(orig_trimmed)
        gen_info  = _probe_video(gen_video)
        log.info("orig %dx%d %.1ffps  gen %dx%d %.1ffps",
                 orig_info["width"], orig_info["height"], orig_info["fps"],
                 gen_info["width"],  gen_info["height"],  gen_info["fps"])

        if orig_info["width"] > gen_info["width"] or orig_info["height"] > gen_info["height"]:
            log.info("Upscaling %dx%d → %dx%d",
                     gen_info["width"], gen_info["height"],
                     orig_info["width"], orig_info["height"])
            upscaled = os.path.join(work_dir, "generated_up.mp4")
            _upscale_video(gen_video, upscaled, orig_info["width"], orig_info["height"])
            os.replace(upscaled, gen_video)
            gen_info = _probe_video(gen_video)

        w   = gen_info["width"]
        h   = gen_info["height"]
        # Use the generated video's actual fps — never cap below it.
        # COMPOSITE_FPS_MAX is only a safety ceiling (e.g. 120fps slow-mo).
        fps = min(gen_info["fps"], float(COMPOSITE_FPS_MAX))

        # ── 5. Extract mid-frame anchors for identity check ───────────────────
        anchor_dir  = os.path.join(work_dir, "anchors")
        os.makedirs(anchor_dir, exist_ok=True)
        orig_anchor = os.path.join(anchor_dir, "orig_mid.jpg")
        gen_anchor  = os.path.join(anchor_dir, "gen_mid.jpg")
        _extract_single_frame(orig_trimmed, orig_info["duration"] / 2, orig_anchor)
        _extract_single_frame(gen_video,    gen_info["duration"]  / 2, gen_anchor)

        # ── 6. Identity similarity check ──────────────────────────────────────
        avg_similarity = -1.0
        mode_used      = "RAW_ACCEPT"

        if _models_ready and _insight_app and os.path.isfile(orig_anchor) and os.path.isfile(gen_anchor):
            emb_orig = _face_embedding_from_file(orig_anchor)
            emb_gen  = _face_embedding_from_file(gen_anchor)
            if emb_orig is not None and emb_gen is not None:
                avg_similarity = _cosine_sim(emb_orig, emb_gen)
                log.info("Identity similarity: %.4f (threshold %.2f)",
                         avg_similarity, COMPOSITE_RAW_ACCEPT_THRESHOLD)
                if avg_similarity < COMPOSITE_RAW_ACCEPT_THRESHOLD:
                    mode_used = "FACE_HEAD_RESTORE"
                    log.info("Identity drift detected → FACE_HEAD_RESTORE")
                else:
                    log.info("Identity preserved → RAW_ACCEPT")
            else:
                log.info("No face detected in anchor frames → RAW_ACCEPT")
        else:
            log.info("Models not ready or anchors missing → RAW_ACCEPT fallback")

        # Unique filename per job so Premiere's findProjectItemByName never
        # confuses this import with a previous one of the same session.
        out_path = os.path.join(work_dir, f"prysmor-{job_id}.mp4")

        # ── 7a. RAW_ACCEPT: cleaned + upscaled generated is good enough ───────
        if mode_used == "RAW_ACCEPT":
            shutil.copy2(gen_video, out_path)
            elapsed_ms = int((time.time() - t_start) * 1000)
            log.info("=== Composite RAW_ACCEPT done in %.1fs ===", elapsed_ms / 1000)
            return {
                "output_path":    out_path,
                "mode_used":      mode_used,
                "avg_similarity": round(avg_similarity, 4),
                "duration_ms":    elapsed_ms,
            }

        # ── 7b. FACE_HEAD_RESTORE: per-frame compositing ──────────────────────
        log.info("Extracting frames at %.1f fps…", fps)
        orig_dir = os.path.join(work_dir, "orig_f")
        gen_dir  = os.path.join(work_dir, "gen_f")
        comp_dir = os.path.join(work_dir, "comp_f")
        os.makedirs(comp_dir, exist_ok=True)

        orig_frames = _extract_frames(orig_trimmed, orig_dir, fps)
        gen_frames  = _extract_frames(gen_video,    gen_dir,  fps)

        if not orig_frames or not gen_frames:
            raise RuntimeError("Frame extraction produced no frames")

        total    = min(len(orig_frames), len(gen_frames))
        face_box = _face_bbox_from_file(orig_anchor)
        log.info("Compositing %d frames | face_box=%s", total, face_box)

        for i in range(total):
            orig_fp = os.path.join(orig_dir, orig_frames[i])
            gen_fp  = os.path.join(gen_dir,  gen_frames[i])
            comp_fp = os.path.join(comp_dir, f"comp-{str(i + 1).zfill(4)}.jpg")
            try:
                composed = _composite_frame_face(orig_fp, gen_fp, face_box, w, h)
                cv2.imwrite(comp_fp, composed, [cv2.IMWRITE_JPEG_QUALITY, 97])
            except Exception as exc:
                log.warning("Frame %d composite failed (%s) — using gen frame", i, exc)
                shutil.copy2(gen_fp, comp_fp)
            if (i + 1) % 24 == 0 or i + 1 == total:
                log.info("Progress: %d/%d (%.0f%%)", i + 1, total, (i + 1) / total * 100)

        # ── 8. Reassemble with original audio ─────────────────────────────────
        log.info("Reassembling…")
        _reassemble_video(comp_dir, orig_trimmed, out_path, fps)

        elapsed_ms = int((time.time() - t_start) * 1000)
        log.info("=== Composite FACE_HEAD_RESTORE done in %.1fs ===", elapsed_ms / 1000)
        return {
            "output_path":    out_path,
            "mode_used":      mode_used,
            "avg_similarity": round(avg_similarity, 4),
            "duration_ms":    elapsed_ms,
        }

    except Exception as exc:
        shutil.rmtree(work_dir, ignore_errors=True)
        log.error("Composite failed: %s", exc, exc_info=True)
        raise HTTPException(500, f"Compositing failed: {exc}")


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=SIDECAR_PORT, log_level="info")
