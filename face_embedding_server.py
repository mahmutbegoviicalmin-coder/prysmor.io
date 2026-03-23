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
import logging
import os
import sys
from io import BytesIO
from typing import Any, List, Optional, Tuple

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


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=SIDECAR_PORT, log_level="info")
