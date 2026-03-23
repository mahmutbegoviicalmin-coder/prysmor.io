"""Make a synthetic face image and test InsightFace detection directly."""
import cv2
import numpy as np
import insightface
from insightface.app import FaceAnalysis

# ── Draw a face ───────────────────────────────────────────────────────────────
h, w = 480, 640
img = np.ones((h, w, 3), dtype=np.uint8) * 200

cx, cy, r = 320, 180, 100

# Face oval (skin tone)
cv2.ellipse(img, (cx, cy), (r, int(r * 1.2)), 0, 0, 360, (195, 155, 120), -1)
# Ears
cv2.ellipse(img, (cx - r, cy), (15, 25), 0, 0, 360, (180, 140, 110), -1)
cv2.ellipse(img, (cx + r, cy), (15, 25), 0, 0, 360, (180, 140, 110), -1)
# Eyebrows
cv2.ellipse(img, (cx - 40, cy - 50), (30, 8), 10, 0, 180, (60, 40, 20), -1)
cv2.ellipse(img, (cx + 40, cy - 50), (30, 8), -10, 0, 180, (60, 40, 20), -1)
# Eyes — whites
cv2.ellipse(img, (cx - 42, cy - 35), (18, 12), 0, 0, 360, (255, 255, 255), -1)
cv2.ellipse(img, (cx + 42, cy - 35), (18, 12), 0, 0, 360, (255, 255, 255), -1)
# Iris + pupil
for ex in [cx - 42, cx + 42]:
    cv2.circle(img, (ex, cy - 35), 9, (50, 30, 10), -1)
    cv2.circle(img, (ex, cy - 35), 4, (0, 0, 0), -1)
    cv2.circle(img, (ex - 2, cy - 37), 2, (255, 255, 255), -1)
# Nose
pts = np.array([(cx, cy - 10), (cx - 12, cy + 30), (cx + 12, cy + 30)], np.int32)
cv2.polylines(img, [pts], True, (150, 100, 80), 2)
cv2.circle(img, (cx - 8, cy + 25), 5, (160, 110, 90), -1)
cv2.circle(img, (cx + 8, cy + 25), 5, (160, 110, 90), -1)
# Lips
cv2.ellipse(img, (cx, cy + 65), (35, 15), 0, 0, 180, (140, 80, 80), -1)
cv2.ellipse(img, (cx, cy + 65), (35, 10), 0, 0, 180, (220, 160, 160), 2)
# Neck + shirt
cv2.rectangle(img, (cx - 40, cy + 100), (cx + 40, cy + 200), (190, 150, 115), -1)
cv2.rectangle(img, (cx - 120, cy + 150), (cx + 120, h), (70, 100, 150), -1)

img = cv2.GaussianBlur(img, (3, 3), 0)
cv2.imwrite("test_face_synth.jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 95])
print(f"Saved test_face_synth.jpg  shape={img.shape}")

# ── InsightFace direct detection ─────────────────────────────────────────────
print("\nLoading InsightFace buffalo_sc...")
app = FaceAnalysis(name="buffalo_sc", providers=["CPUExecutionProvider"])
app.prepare(ctx_id=0, det_size=(640, 640))
faces = app.get(img)
print(f"InsightFace direct → {len(faces)} face(s) detected")
if faces:
    f = faces[0]
    print(f"  conf={f.det_score:.3f}  box={f.bbox.tolist()}")
    if f.normed_embedding is not None:
        e = f.normed_embedding
        print(f"  embedding dim={len(e)}  first=[{e[0]:.4f}, {e[1]:.4f}, ...]")
else:
    print("  (Synthetic face not detected — using thispersondoesnotexist image)")
