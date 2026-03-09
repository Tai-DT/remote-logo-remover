import cv2, numpy as np
from skimage.restoration import inpaint_biharmonic

# Test on car.jpg (landscape 4K) — Veo coords: x=3591, y=2012, w=220, h=103
img = cv2.imread("runtime/inspect/car.jpg")
fh, fw = img.shape[:2]
print(f"Frame: {fw}x{fh}")

x, y, w, h = 3591, 2012, 220, 103
PAD = max(30, max(w, h) // 2)
cx0 = max(0, x - PAD);   cy0 = max(0, y - PAD)
cx1 = min(fw, x+w+PAD);  cy1 = min(fh, y+h+PAD)
cw  = cx1 - cx0;          ch  = cy1 - cy0

mask_uint8 = np.zeros((ch, cw), dtype=np.uint8)
mask_uint8[y-cy0 : y-cy0+h, x-cx0 : x-cx0+w] = 255
mask_bool = mask_uint8.astype(bool)

before = img[cy0:cy1, cx0:cx1].copy()
crop   = img[cy0:cy1, cx0:cx1]

# xphoto.inpaint mask convention: 0 = inpaint area, 255 = valid area (opposite!)
mask_xphoto = 255 - mask_uint8

# ── ShiftMap (exemplar/patch-based, needs CIELab input) ─────────────────
print("Running ShiftMap...")
crop_lab = cv2.cvtColor(crop, cv2.COLOR_BGR2Lab)
dst_lab   = crop_lab.copy()
cv2.xphoto.inpaint(crop_lab, mask_xphoto, dst_lab, cv2.xphoto.INPAINT_SHIFTMAP)
after_shift = cv2.cvtColor(dst_lab, cv2.COLOR_Lab2BGR)

# ── FSR_FAST (frequency-selective reconstruction, BGR direct) ────────────
print("Running FSR_FAST...")
dst_fsr = crop.copy()
cv2.xphoto.inpaint(crop, mask_xphoto, dst_fsr, cv2.xphoto.INPAINT_FSR_FAST)

# ── Telea (OpenCV) ─────────────────────────────────────────────────────────
after_telea = cv2.inpaint(crop, mask_uint8, inpaintRadius=3, flags=cv2.INPAINT_TELEA)

# ── Biharmonic (scikit-image) ──────────────────────────────────────────────
print("Running biharmonic...")
rgb_f = crop[:, :, ::-1].astype(np.float64) / 255.0
result_f = inpaint_biharmonic(rgb_f, mask_bool, channel_axis=-1)
after_bih = (result_f[:, :, ::-1] * 255).clip(0, 255).astype(np.uint8)

# Full frame with ShiftMap applied
img_out = img.copy()
img_out[cy0:cy1, cx0:cx1] = after_shift

cv2.imwrite("runtime/inspect/test_inpaint_before.jpg",    before)
cv2.imwrite("runtime/inspect/test_inpaint_shiftmap.jpg",  after_shift)
cv2.imwrite("runtime/inspect/test_inpaint_fsr.jpg",       dst_fsr)
cv2.imwrite("runtime/inspect/test_inpaint_telea.jpg",     after_telea)
cv2.imwrite("runtime/inspect/test_inpaint_biharmonic.jpg", after_bih)
cv2.imwrite("runtime/inspect/test_inpaint_full.jpg",       img_out)
print("Done — saved to runtime/inspect/:")
print("  before      ← gốc có watermark")
print("  shiftmap    ← ShiftMap (copy patch thực từ ảnh - tốt nhất)")
print("  fsr         ← FSR_FAST (frequency-selective)")
print("  telea       ← OpenCV Telea")
print("  biharmonic  ← scikit-image biharmonic")
print("  full        ← frame đầy đủ với ShiftMap")
