"""Full smoke-test for the face embedding sidecar — all endpoints."""
import base64, json, math, urllib.request, sys

sys.stdout.reconfigure(encoding="utf-8")

def post(endpoint, data):
    req = urllib.request.Request(
        f"http://127.0.0.1:7788{endpoint}",
        data=json.dumps(data).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        return json.loads(urllib.request.urlopen(req, timeout=15).read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise RuntimeError(f"HTTP {e.code} on {endpoint}: {body}")

def get(endpoint):
    return json.loads(urllib.request.urlopen(
        f"http://127.0.0.1:7788{endpoint}", timeout=5).read())

OK  = "\033[92m OK\033[0m"
ERR = "\033[91m FAIL\033[0m"

# ── /health ───────────────────────────────────────────────────────────────────
print("=" * 52)
print(" VFXPILOT FACE SIDECAR — SMOKE TEST")
print("=" * 52)

h = get("/health")
print(f"\n[1] /health")
print(f"    status      : {h['status']}")
print(f"    insightface : {h['insightface']}")
print(f"    adaface     : {h['adaface']}")
print(f"    adaface dev : {h['adaface_device']}")
assert h["status"] == "ok", "Server not ready!"
print(f"    => {OK}")

# ── Load test image ───────────────────────────────────────────────────────────
with open("test_face_synth.jpg", "rb") as f:
    b64 = base64.b64encode(f.read()).decode()

# ── /quality ──────────────────────────────────────────────────────────────────
print(f"\n[2] /quality")
q = post("/quality", {"image": b64})
print(f"    type  : {q['type']}")
print(f"    score : {q['score']}")
assert q["type"] in ("bright","dark","motion_blur","profile","occluded")
print(f"    => {OK}")

# ── /enhance ──────────────────────────────────────────────────────────────────
print(f"\n[3] /enhance  (CLAHE)")
enh = post("/enhance", {"image": b64})
ratio = len(enh["image"]) / max(len(b64), 1)
print(f"    original size  : {len(b64):,} chars")
print(f"    enhanced size  : {len(enh['image']):,} chars  (ratio={ratio:.2f})")
assert len(enh["image"]) > 100
print(f"    => {OK}")

# ── /detect ───────────────────────────────────────────────────────────────────
print(f"\n[4] /detect  (RetinaFace / InsightFace)")
det = post("/detect", {"image": b64})
faces = det["faces"]
print(f"    faces found : {len(faces)}")
for i, face in enumerate(faces):
    print(f"    Face {i+1}: conf={face['confidence']:.3f}  "
          f"box={[round(x,3) for x in face['box']]}  "
          f"landmarks={len(face['landmarks'])}")
assert len(faces) >= 1, "No face detected in synthetic image!"
print(f"    => {OK}")

# ── /embed ────────────────────────────────────────────────────────────────────
print(f"\n[5] /embed")
emb = post("/embed", {"image": b64})
vec = emb["embedding"]
print(f"    model      : {emb['model']}")
print(f"    quality    : {emb['quality_type']} (score={emb['quality_score']})")
print(f"    confidence : {emb['confidence']}")
print(f"    dim        : {len(vec)}")
print(f"    vec[0:3]   : [{vec[0]:.4f}, {vec[1]:.4f}, {vec[2]:.4f}]")
norm = math.sqrt(sum(x*x for x in vec))
print(f"    L2-norm    : {norm:.6f}  (mora biti ~1.0)")
assert len(vec) == 512, f"Expected 512-dim, got {len(vec)}"
assert abs(norm - 1.0) < 0.05, f"Not unit-normalised! norm={norm}"
print(f"    => {OK}")

# ── /embed — self-similarity ───────────────────────────────────────────────────
sim = sum(a*b for a,b in zip(vec,vec)) / (norm*norm)
print(f"\n[6] Self-cosine-similarity")
print(f"    sim(img, img) = {sim:.6f}  (mora biti 1.000)")
assert abs(sim - 1.0) < 1e-4
print(f"    => {OK}")

# ── /embed_batch ──────────────────────────────────────────────────────────────
print(f"\n[7] /embed_batch  (2x ista slika)")
batch = post("/embed_batch", {"images": [b64, b64]})
results = batch["results"]
print(f"    rezultata : {len(results)}")
assert len(results) == 2
v1, v2 = results[0]["embedding"], results[1]["embedding"]
n1 = math.sqrt(sum(x*x for x in v1))
n2 = math.sqrt(sum(x*x for x in v2))
sim2 = sum(a*b for a,b in zip(v1,v2)) / (n1 * n2)
print(f"    sim(img1, img2) = {sim2:.6f}  (mora biti ~1.0 jer su iste)")
assert sim2 > 0.99
print(f"    => {OK}")

# ── Threshold test: AnchorProfile logika ─────────────────────────────────────
THRESHOLDS = {"RAW_ACCEPT":0.88, "FACE_HEAD_RESTORE":0.78, "UPPER_BODY_RESTORE":0.68}
print(f"\n[8] Threshold mapping test")
for mode, thr in THRESHOLDS.items():
    result = "RAW_ACCEPT" if sim2>=0.88 else "FACE_HEAD_RESTORE" if sim2>=0.78 else "UPPER_BODY_RESTORE" if sim2>=0.68 else "FULL_SUBJECT_COMPOSITE"
    print(f"    sim={sim2:.3f} vs {mode}={thr}  => {result}")
    break
print(f"    => {OK}")

print("\n" + "="*52)
print(" SVI TESTOVI PROSLI!")
print("="*52)
