# Remote Logo Remover

Công cụ chạy cục bộ để xoá watermark/logo cố định ở góc video hoặc chèn logo mới bằng `ffmpeg`.

## Yêu cầu

- Node.js 20+
- `ffmpeg`
- `ffprobe`

Lưu ý:
- Khi đóng gói Electron, app đã tự kèm `ffmpeg` và `ffprobe`.
- Bạn vẫn có thể ghi đè bằng `FFMPEG_PATH` và `FFPROBE_PATH` nếu cần.

## Chạy bản web cục bộ

```bash
npm install
npm start
```

Mở `http://localhost:4173`.

## Chạy bản desktop Electron

```bash
npm install
npm run desktop
```

## Build ứng dụng desktop

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

Build dạng thư mục:

```bash
npm run dist:dir
```

Ghi chú:
- Bản macOS nên build trên macOS.
- Cấu hình build Windows đã có sẵn, nhưng để ra installer đẹp và ổn định thì nên build trên Windows hoặc CI Windows.
- Workflow CI nằm ở `.github/workflows/build-desktop.yml`.

## App làm được gì

- Đọc video cục bộ bằng đường dẫn tuyệt đối
- Tự nhận độ phân giải, thời lượng, codec và frame rate
- Tạo ảnh preview từ video
- Xếp nhiều video vào hàng đợi để xử lý hàng loạt
- Xuất video theo hai chế độ:
  - `Cắt tự động`: cắt mép phải/dưới để loại watermark, sau đó có thể phóng lại về kích thước gốc
  - `Chèn logo`: đè ảnh logo mới lên video với vị trí, kích thước và độ mờ tuỳ chỉnh
- Kéo logo trực tiếp trên khung preview để đặt vị trí
- Áp dụng cấu hình hiện tại cho toàn bộ video đang chờ

## Quy trình sử dụng khuyến nghị

1. Thêm video vào hàng đợi.
2. Chọn một video để kiểm tra preview.
3. Dùng `Cắt tự động` để xoá watermark cố định ở góc.
4. Giữ bật `Phóng lại về kích thước gốc` nếu muốn giữ đúng resolution đầu ra.
5. Chỉ dùng `Chèn logo` khi bạn muốn đè logo thương hiệu mới lên video.
6. Bấm `Bắt đầu xuất`.

## Preset mặc định

Preset tích hợp được xây từ đúng vị trí watermark mẫu trong thư mục dự án:

- `Ngang 3840x2160`
  - `Cắt tự động`: `right=240`, `bottom=120`
- `Dọc 2160x3840`
  - `Cắt tự động`: `right=280`, `bottom=180`

App sẽ ưu tiên:

1. Khớp đúng độ phân giải nếu có preset chính xác.
2. Nếu không có, nội suy preset gần nhất theo cùng orientation.

## Chọn tệp

- Ở chế độ trình duyệt thường, hãy dùng đường dẫn tuyệt đối cho video và logo.
- Ở chế độ Electron, hộp thoại chọn file sẽ lọc đúng loại video hoặc ảnh logo.
- File đầu ra mặc định sẽ nằm cạnh file gốc và có hậu tố `_no_logo`.

## Tài liệu bổ sung

- Hướng dẫn thao tác chi tiết: [docs/HUONG_DAN_SU_DUNG.md](/Users/tai/Desktop/remote_logo/docs/HUONG_DAN_SU_DUNG.md)
- Video hướng dẫn sau khi dựng xong: [output/tutorial/huong-dan-su-dung.mp4](/Users/tai/Desktop/remote_logo/output/tutorial/huong-dan-su-dung.mp4)
- Script dựng lại video: [scripts/build_tutorial_video.sh](/Users/tai/Desktop/remote_logo/scripts/build_tutorial_video.sh)
