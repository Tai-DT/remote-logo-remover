#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT/output/tutorial"
SEG_DIR="$OUT_DIR/_segments"
FONT_FILE="${FONT_FILE:-/System/Library/Fonts/Supplemental/Arial.ttf}"

mkdir -p "$SEG_DIR"

for file in \
  "$OUT_DIR/step-1-empty.png" \
  "$OUT_DIR/step-2-ready.png" \
  "$OUT_DIR/step-3-processing.png" \
  "$OUT_DIR/step-4-done.png" \
  "$OUT_DIR/step-5-preview-result.png"
do
  if [[ ! -f "$file" ]]; then
    echo "Thiếu ảnh đầu vào: $file" >&2
    exit 1
  fi
done

if [[ ! -f "$FONT_FILE" ]]; then
  echo "Không tìm thấy font: $FONT_FILE" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

make_text() {
  local path="$1"
  shift
  printf '%s\n' "$*" >"$path"
}

make_image_segment() {
  local image="$1"
  local duration="$2"
  local title="$3"
  local caption="$4"
  local output="$5"
  local title_file="$TMP_DIR/$(basename "$output").title.txt"
  local caption_file="$TMP_DIR/$(basename "$output").caption.txt"
  local fade_out
  fade_out="$(awk "BEGIN { printf \"%.2f\", $duration - 0.60 }")"

  make_text "$title_file" "$title"
  make_text "$caption_file" "$caption"

  ffmpeg -y -loop 1 -framerate 30 -t "$duration" -i "$image" \
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x101619,drawbox=0:0:iw:138:color=0x0b1b1e@0.86:t=fill,drawbox=0:900:iw:180:color=0x0b1b1e@0.88:t=fill,drawtext=fontfile='$FONT_FILE':textfile='$title_file':fontcolor=white:fontsize=48:x=84:y=44,drawtext=fontfile='$FONT_FILE':textfile='$caption_file':fontcolor=0xD5E4DD:fontsize=28:line_spacing=8:x=84:y=928,fade=t=in:st=0:d=0.45,fade=t=out:st=$fade_out:d=0.60" \
    -c:v libx264 -pix_fmt yuv420p -r 30 -movflags +faststart "$output" >/dev/null 2>&1
}

make_title_segment() {
  local duration="$1"
  local title="$2"
  local caption="$3"
  local output="$4"
  local title_file="$TMP_DIR/$(basename "$output").title.txt"
  local caption_file="$TMP_DIR/$(basename "$output").caption.txt"
  local fade_out
  fade_out="$(awk "BEGIN { printf \"%.2f\", $duration - 0.60 }")"

  make_text "$title_file" "$title"
  make_text "$caption_file" "$caption"

  ffmpeg -y -f lavfi -i "color=c=0x0f1419:s=1920x1080:d=$duration:r=30" \
    -vf "drawbox=84:158:1752:296:color=0x13343a@0.96:t=fill,drawbox=84:494:1752:180:color=0x0f1e22@0.90:t=fill,drawbox=84:732:720:2:color=0x58c5b1@0.90:t=fill,drawtext=fontfile='$FONT_FILE':text='REMOTE LOGO REMOVER':fontcolor=0x8FD6C5:fontsize=28:x=84:y=112,drawtext=fontfile='$FONT_FILE':textfile='$title_file':fontcolor=white:fontsize=64:line_spacing=10:x=116:y=244,drawtext=fontfile='$FONT_FILE':textfile='$caption_file':fontcolor=0xD5E4DD:fontsize=32:line_spacing=10:x=116:y=548,drawtext=fontfile='$FONT_FILE':text='Huong dan thao tac nhanh tren giao dien da Viet hoa':fontcolor=0x7db8ac:fontsize=24:x=84:y=764,fade=t=in:st=0:d=0.45,fade=t=out:st=$fade_out:d=0.60" \
    -c:v libx264 -pix_fmt yuv420p -r 30 -movflags +faststart "$output" >/dev/null 2>&1
}

make_title_segment 3.8 \
  "Hướng dẫn sử dụng" \
  "Quy trình ngắn: thêm video, kiểm tra preset, xuất file và xem kết quả ngay trong app." \
  "$SEG_DIR/00-title.mp4"

make_image_segment "$OUT_DIR/step-1-empty.png" 4.8 \
  "1. Thêm video vào hàng đợi" \
  "Kéo thả file, bấm Duyệt hoặc dán đường dẫn tuyệt đối rồi bấm Thêm." \
  "$SEG_DIR/01-empty.mp4"

make_image_segment "$OUT_DIR/step-2-ready.png" 5.0 \
  "2. Kiểm tra preview và preset" \
  "App tự đọc độ phân giải, tạo ảnh xem trước và chọn preset khớp với đúng kích thước video." \
  "$SEG_DIR/02-ready.mp4"

make_image_segment "$OUT_DIR/step-3-processing.png" 4.8 \
  "3. Chọn cách xử lý rồi bắt đầu xuất" \
  "Dùng Cắt tự động để xoá watermark góc cố định; nếu cần có thể chuyển sang Chèn logo." \
  "$SEG_DIR/03-processing.mp4"

make_image_segment "$OUT_DIR/step-4-done.png" 4.6 \
  "4. Kiểm tra trạng thái hoàn tất" \
  "Khi xong, app sẽ hiện ngay các nút xem video, tải về và mở thư mục đầu ra." \
  "$SEG_DIR/04-done.mp4"

make_image_segment "$OUT_DIR/step-5-preview-result.png" 4.2 \
  "5. Mở video thành phẩm để rà nhanh" \
  "Bấm Xem video để kiểm tra file trước khi chạy hàng loạt cho các video còn lại." \
  "$SEG_DIR/05-preview-result.mp4"

cat >"$SEG_DIR/concat.txt" <<EOF
file '$SEG_DIR/00-title.mp4'
file '$SEG_DIR/01-empty.mp4'
file '$SEG_DIR/02-ready.mp4'
file '$SEG_DIR/03-processing.mp4'
file '$SEG_DIR/04-done.mp4'
file '$SEG_DIR/05-preview-result.mp4'
EOF

ffmpeg -y -f concat -safe 0 -i "$SEG_DIR/concat.txt" -c copy -movflags +faststart \
  "$OUT_DIR/huong-dan-su-dung.mp4" >/dev/null 2>&1

echo "Đã tạo video: $OUT_DIR/huong-dan-su-dung.mp4"
