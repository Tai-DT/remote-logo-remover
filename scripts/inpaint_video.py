#!/usr/bin/env python3
"""
Frame-by-frame inpainting to remove watermarks from video.
Pipeline: ffmpeg decode → Python (modify only ROI) → ffmpeg encode.

Quality: CRF 10 by default (near-lossless, ~4× better than the old CRF 16).
Only the small ROI crop is processed by Python; the rest passes through unchanged.
ffmpeg encode's stderr is inherited so time= progress reaches server.js.

Args: sys.argv[1] = JSON string with keys:
  input, output, x, y, w, h, ffmpeg,
  videoWidth, videoHeight, fps, preset, crf
"""
import sys, json, signal, subprocess as sp

def read_exact(pipe, n):
    buf = bytearray()
    while len(buf) < n:
        chunk = pipe.read(n - len(buf))
        if not chunk:
            return bytes(buf)
        buf.extend(chunk)
    return bytes(buf)

def make_inpaint_fn(mask_uint8):
    """
    Return an inpaint function: (crop_bgr_uint8) → inpainted_bgr_uint8.
    Priority: OpenCV ShiftMap → FSR_FAST → biharmonic → Telea
    """
    import cv2, numpy as np
    mask_xphoto = 255 - mask_uint8
    try:
        probe_bgr = np.zeros((8, 8, 3), dtype=np.uint8)
        probe_lab = cv2.cvtColor(probe_bgr, cv2.COLOR_BGR2Lab)
        probe_m   = np.full((8, 8), 255, dtype=np.uint8); probe_m[3:5, 3:5] = 0
        dst_probe = probe_lab.copy()
        cv2.xphoto.inpaint(probe_lab, probe_m, dst_probe, cv2.xphoto.INPAINT_SHIFTMAP)
        print("[inpaint] using OpenCV ShiftMap (exemplar-based, CIELab)", file=sys.stderr, flush=True)
        def _shiftmap(crop):
            lab = cv2.cvtColor(crop, cv2.COLOR_BGR2Lab)
            dst = lab.copy()
            cv2.xphoto.inpaint(lab, mask_xphoto, dst, cv2.xphoto.INPAINT_SHIFTMAP)
            return cv2.cvtColor(dst, cv2.COLOR_Lab2BGR)
        return _shiftmap
    except Exception as e_sm:
        print(f"[inpaint] ShiftMap unavailable ({e_sm}), trying FSR_FAST", file=sys.stderr, flush=True)
        try:
            probe2 = np.zeros((8, 8, 3), dtype=np.uint8)
            probe_m2 = np.full((8, 8), 255, dtype=np.uint8); probe_m2[3:5, 3:5] = 0
            dst2 = probe2.copy()
            cv2.xphoto.inpaint(probe2, probe_m2, dst2, cv2.xphoto.INPAINT_FSR_FAST)
            print("[inpaint] using OpenCV FSR_FAST", file=sys.stderr, flush=True)
            def _fsr(crop):
                dst = crop.copy()
                cv2.xphoto.inpaint(crop, mask_xphoto, dst, cv2.xphoto.INPAINT_FSR_FAST)
                return dst
            return _fsr
        except Exception as e_fsr:
            print(f"[inpaint] FSR unavailable ({e_fsr}), trying biharmonic", file=sys.stderr, flush=True)
            try:
                from skimage.restoration import inpaint_biharmonic
                mask_bool = mask_uint8.astype(bool)
                print("[inpaint] using scikit-image biharmonic", file=sys.stderr, flush=True)
                def _biharmonic(crop):
                    rgb = crop[:,:,::-1].astype(np.float64) / 255.0
                    res = inpaint_biharmonic(rgb, mask_bool, channel_axis=-1)
                    return (res[:,:,::-1] * 255).clip(0,255).astype(np.uint8)
                return _biharmonic
            except Exception as e_bih:
                print(f"[inpaint] biharmonic unavailable ({e_bih}), using Telea", file=sys.stderr, flush=True)
                def _telea(crop):
                    return cv2.inpaint(crop, mask_uint8, inpaintRadius=3, flags=cv2.INPAINT_TELEA)
                return _telea

def run():
    import numpy as np

    cfg    = json.loads(sys.argv[1])
    inp    = cfg["input"]
    out    = cfg["output"]
    x, y   = int(cfg["x"]),           int(cfg["y"])
    w, h   = max(1, int(cfg["w"])),   max(1, int(cfg["h"]))
    fw, fh = int(cfg["videoWidth"]),  int(cfg["videoHeight"])
    fps    = str(cfg.get("fps", "30"))
    ff     = cfg["ffmpeg"]
    preset = cfg.get("preset", "slow")
    crf    = str(cfg.get("crf", 10))

    # ── ROI: crop with generous padding so inpainting has context ──────────────
    PAD = max(30, max(w, h) // 2)
    cx0 = max(0,  x - PAD);  cy0 = max(0,  y - PAD)
    cx1 = min(fw, x + w + PAD); cy1 = min(fh, y + h + PAD)
    cw  = cx1 - cx0;  ch = cy1 - cy0

    # Logo sub-region within the crop (where text is expected)
    lx0 = x - cx0; ly0 = y - cy0

    # Binary mask (white = region to inpaint) in the cropped coordinate space
    mask = np.zeros((ch, cw), dtype=np.uint8)
    mask[ly0 : ly0 + h, lx0 : lx0 + w] = 255

    print(f"[pipeline] single-pipe mode: ROI {cw}x{ch} at ({cx0},{cy0}), "
          f"full frame {fw}x{fh}, crf={crf}", file=sys.stderr, flush=True)

    # ── Select inpainting algorithm ───────────────────────────────────────────
    method = cfg.get("method", "reconstruct")
    if method == "smart":
        import cv2
        LUMA_THR  = int(cfg.get("lumaThr", 190))
        SAT_THR   = int(cfg.get("satThr", 35))
        DILATE_PX = int(cfg.get("dilatePx", 2))
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (DILATE_PX*2+1, DILATE_PX*2+1))
        base_inpaint = make_inpaint_fn(mask)
        print(f"[inpaint] using SMART text detection (luma>{LUMA_THR}, sat<{SAT_THR}, dilate={DILATE_PX}px)",
              file=sys.stderr, flush=True)
        def inpaint(crop):
            roi = crop[ly0:ly0+h, lx0:lx0+w]
            roi_f = roi.astype(np.float32)
            b, g, r = roi_f[:,:,0], roi_f[:,:,1], roi_f[:,:,2]
            luma = 0.114 * b + 0.587 * g + 0.299 * r
            sat  = np.max(roi_f, axis=2) - np.min(roi_f, axis=2)
            text_mask_roi = ((luma >= LUMA_THR) & (sat <= SAT_THR)).astype(np.uint8) * 255
            text_mask_roi = cv2.dilate(text_mask_roi, kernel, iterations=1)
            dyn_mask = np.zeros((ch, cw), dtype=np.uint8)
            dyn_mask[ly0:ly0+h, lx0:lx0+w] = text_mask_roi
            if cv2.countNonZero(dyn_mask) == 0:
                return crop
            return cv2.inpaint(crop, dyn_mask, inpaintRadius=3, flags=cv2.INPAINT_TELEA)
    elif method == "blur":
        import cv2
        ksize = max(21, (max(w, h) // 4) | 1)
        print(f"[inpaint] using Gaussian blur (kernel={ksize})", file=sys.stderr, flush=True)
        def inpaint(crop):
            blurred = cv2.GaussianBlur(crop, (ksize, ksize), 0)
            result  = crop.copy()
            result[ly0:ly0+h, lx0:lx0+w] = blurred[ly0:ly0+h, lx0:lx0+w]
            return result
    else:
        inpaint = make_inpaint_fn(mask)

    # ── Decode full frame ─────────────────────────────────────────────────────
    dec = sp.Popen(
        [ff, "-i", inp, "-f", "rawvideo", "-pix_fmt", "bgr24", "pipe:1"],
        stdout=sp.PIPE, stderr=sp.DEVNULL
    )

    # ── Encode full frame (same pipe = guaranteed sync) ───────────────────────
    # stderr=None → inherit Python's stderr → ffmpeg progress reaches server.js
    enc = sp.Popen(
        [ff, "-y",
         "-f", "rawvideo", "-pix_fmt", "bgr24",
         "-s", f"{fw}x{fh}", "-r", fps,
         "-i", "pipe:0",
         "-i", inp,
         "-map", "0:v", "-map", "1:a?",
         "-c:v", "libx264", "-preset", preset, "-crf", crf,
         "-c:a", "copy", out],
        stdin=sp.PIPE, stderr=None
    )

    # ── SIGTERM: clean up subprocesses ────────────────────────────────────────
    def on_term(sig, frame):
        try: enc.kill()
        except Exception: pass
        try: dec.kill()
        except Exception: pass
        sys.exit(1)
    signal.signal(signal.SIGTERM, on_term)

    # ── Frame loop: only modify ROI, rest passes through unchanged ────────────
    frame_sz = fw * fh * 3
    try:
        while True:
            raw = read_exact(dec.stdout, frame_sz)
            if len(raw) < frame_sz:
                break
            frame = np.frombuffer(raw, dtype=np.uint8).reshape((fh, fw, 3)).copy()

            # Inpaint only the ROI crop, paste back into full frame
            crop = frame[cy0:cy1, cx0:cx1]
            frame[cy0:cy1, cx0:cx1] = inpaint(crop)

            enc.stdin.write(frame.tobytes())
    except BrokenPipeError:
        pass
    finally:
        try: enc.stdin.close()
        except Exception: pass

    enc.wait()
    dec.kill()
    dec.wait()

    if enc.returncode != 0:
        raise RuntimeError(f"ffmpeg encode exited with code {enc.returncode}")

if __name__ == "__main__":
    try:
        run()
    except ImportError as e:
        print(f"ImportError: {e}", file=sys.stderr)
        sys.exit(2)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
