#!/usr/bin/env python3
"""
Precise Veo watermark detector -- column-density clustering.
Usage: detect_veo.py <path> <ffmpeg> <ffprobe>
Outputs JSON: { x, y, w, h, videoWidth, videoHeight, framesAnalyzed }
"""
import sys, json, subprocess as sp, os

def probe(path, ffprobe):
    r = sp.run([ffprobe, "-v", "error", "-select_streams", "v:0",
                "-show_entries", "stream=width,height",
                "-show_entries", "format=duration",
                "-of", "json", path], capture_output=True, text=True)
    d = json.loads(r.stdout)
    s = d["streams"][0]
    return int(s["width"]), int(s["height"]), float(d.get("format", {}).get("duration") or 0)

def extract_roi(path, ffmpeg, ts, rx, ry, rw, rh, is_img):
    seek = [] if is_img else ["-ss", str(ts)]
    r = sp.run([ffmpeg] + seek + ["-i", path, "-frames:v", "1",
        "-vf", f"crop={rw}:{rh}:{rx}:{ry}", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
        capture_output=True)
    return r.stdout

def detect_in_roi(raw, rw, rh):
    n = rw * rh
    if len(raw) < n * 3:
        return None
    lumas = [0.0] * n
    sats  = [0]   * n
    for i in range(n):
        rv, gv, bv = raw[i*3], raw[i*3+1], raw[i*3+2]
        lumas[i] = 0.299*rv + 0.587*gv + 0.114*bv
        sats[i]  = max(rv, gv, bv) - min(rv, gv, bv)
    sorted_l = sorted(lumas)
    # Fixed thresholds tuned from pixel analysis of real Veo watermarks.
    # Veo text = bright white (luma 200-210, sat 14-20).
    # Using fixed threshold avoids false positives from bright backgrounds.
    thr_l = 195.0
    thr_s = 35
    min_x, min_y = rw, rh
    max_x, max_y = -1, -1
    for i in range(n):
        if lumas[i] >= thr_l and sats[i] <= thr_s:
            px, py = i % rw, i // rw
            if px < min_x: min_x = px
            if py < min_y: min_y = py
            if px > max_x: max_x = px
            if py > max_y: max_y = py
    if max_x < 0:
        return None
    return (min_x, min_y, max_x, max_y)

def detect_veo(path, ffmpeg, ffprobe):
    is_img = os.path.splitext(path)[1].lower() in (".jpg",".jpeg",".png",".bmp",".webp")
    if is_img:
        r = sp.run([ffprobe, "-v","error","-select_streams","v:0",
                    "-show_entries","stream=width,height","-of","json",path],
                   capture_output=True, text=True)
        d = json.loads(r.stdout); s = d["streams"][0]
        width, height, dur = int(s["width"]), int(s["height"]), 0.0
        timestamps = [0.0]
    else:
        width, height, dur = probe(path, ffprobe)
        dur = max(dur, 1.0)
        timestamps = [dur*0.10, dur*0.50, dur*0.90]
    rx = int(width  * 0.90); ry = int(height * 0.90)
    rw = (width  - rx) & ~1; rh = (height - ry) & ~1
    if rw < 10 or rh < 10:
        return {"error": "ROI too small", "videoWidth": width, "videoHeight": height}
    boxes = []; valid = 0
    for ts in timestamps:
        raw  = extract_roi(path, ffmpeg, ts, rx, ry, rw, rh, is_img)
        bbox = detect_in_roi(raw, rw, rh)
        if bbox:
            valid += 1
            boxes.append(bbox)
    if not boxes:
        return {"error":"Watermark not found","videoWidth":width,"videoHeight":height}
    # Use median of each coordinate to reject outlier frames (e.g. bright backgrounds)
    boxes.sort(key=lambda b: (b[2]-b[0]) * (b[3]-b[1]))  # sort by area
    mid = len(boxes) // 2
    best = boxes[mid]  # median-area box
    P = 4
    ax = max(0,    rx + best[0] - P)
    ay = max(0,    ry + best[1] - P)
    aw = min(width  - ax, best[2]-best[0] + P*2 + 1)
    ah = min(height - ay, best[3]-best[1] + P*2 + 1)
    return {"x":ax,"y":ay,"w":aw,"h":ah,"videoWidth":width,"videoHeight":height,"framesAnalyzed":valid}

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(json.dumps({"error":"Usage: detect_veo.py <path> <ffmpeg> <ffprobe>"})); sys.exit(1)
    print(json.dumps(detect_veo(sys.argv[1], sys.argv[2], sys.argv[3])))

