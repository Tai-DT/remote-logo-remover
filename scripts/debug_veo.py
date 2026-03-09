#!/usr/bin/env python3
"""Debug: scan pixel values in the Veo watermark area."""
import sys, json, subprocess as sp

# Resolve bundled ffmpeg/ffprobe from node_modules
def node_eval(code):
    r = sp.run(["node", "-e", code], capture_output=True, text=True,
                cwd="/Users/tai/Desktop/remote_logo")
    return r.stdout.strip()

ffmpeg  = node_eval("const f=require('ffmpeg-static'); process.stdout.write(f)") or "ffmpeg"
ffprobe = node_eval("const f=require('ffprobe-static'); process.stdout.write(f.path)") or "ffprobe"
print("ffmpeg :", ffmpeg)
print("ffprobe:", ffprobe)

def analyze(img_path, W, H, rx_pct=0.935, ry_pct=0.917):
    roi_x = int(W * rx_pct)
    roi_y = int(H * ry_pct)
    roi_w = W - roi_x
    roi_h = H - roi_y
    print(f"\n[{img_path}] size={W}x{H}  ROI: x={roi_x} y={roi_y} w={roi_w} h={roi_h}")

    r = sp.run([
        ffmpeg, "-y", "-i", img_path,
        "-frames:v", "1",
        "-vf", f"crop={roi_w}:{roi_h}:{roi_x}:{roi_y}",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"
    ], capture_output=True)
    raw = r.stdout
    n_px = roi_w * roi_h
    got = len(raw)
    print(f"  raw bytes got={got}, expected={n_px*3}")
    if got < n_px * 3:
        print("  ERROR: insufficient data")
        return

    pixels = [(raw[i*3], raw[i*3+1], raw[i*3+2]) for i in range(n_px)]
    lumas = [0.299*p[0] + 0.587*p[1] + 0.114*p[2] for p in pixels]
    sats  = [max(p) - min(p) for p in pixels]

    luma_s = sorted(lumas)
    med = luma_s[len(luma_s)//2]
    mn  = luma_s[0]
    mx  = luma_s[-1]
    top5 = luma_s[int(len(luma_s)*0.95):]
    print(f"  Luma: min={mn:.0f}  median={med:.0f}  max={mx:.0f}  top5%_mean={sum(top5)/len(top5):.0f}")
    print(f"  Sat:  neutral(<30)={sum(1 for s in sats if s<30)}  neutral(<60)={sum(1 for s in sats if s<60)}")

    # Find bright + neutral (white text) pixels
    candidates = []
    for i in range(n_px):
        if sats[i] < 45 and lumas[i] > 150:
            px = i % roi_w
            py = i // roi_w
            candidates.append((lumas[i], sats[i], px, py))
    candidates.sort(reverse=True)
    print(f"  Bright+neutral candidates: {len(candidates)}")
    if candidates:
        xs = [c[2] for c in candidates]
        ys = [c[3] for c in candidates]
        print(f"  Bounding box in ROI: x=[{min(xs)}..{max(xs)}]  y=[{min(ys)}..{max(ys)}]")
        abs_x = roi_x + min(xs) - 4
        abs_y = roi_y + min(ys) - 4
        abs_w = max(xs) - min(xs) + 9
        abs_h = max(ys) - min(ys) + 9
        print(f"  => delogo x={abs_x} y={abs_y} w={abs_w} h={abs_h}")
        print("  Top samples:")
        for luma, sat, px, py in candidates[:8]:
            print(f"    luma={luma:.0f} sat={sat:3d}  roi({px},{py})  abs({roi_x+px},{roi_y+py})  rgb={pixels[py*roi_w+px]}")

analyze("runtime/inspect/car.jpg",  3840, 2160)
analyze("runtime/inspect/girl.jpg", 2160, 3840)
