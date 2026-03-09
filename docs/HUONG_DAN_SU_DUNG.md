# Hướng Dẫn Sử Dụng Remote Logo Remover

Tài liệu này dành cho người dùng cuối cần xoá watermark góc cố định hoặc chèn logo mới lên video ngay trên máy cá nhân.

## 1. Mục đích của app

App xử lý video cục bộ, không upload video của bạn lên server ngoài. Toàn bộ việc đọc thông tin, tạo preview và xuất file đều chạy bằng `ffmpeg` và `ffprobe` trên chính máy đang dùng.

App phù hợp nhất khi:

- watermark nằm cố định ở góc phải dưới
- bạn muốn xử lý nhiều video cùng lúc
- bạn muốn giữ nguyên độ phân giải đầu ra
- bạn muốn thay watermark cũ bằng logo thương hiệu mới

## 2. Giao diện chính

Giao diện được chia thành 3 vùng:

- Thanh công cụ phía trên:
  - `Thêm`, `Duyệt`, `Bắt đầu xuất`, `Dừng`, `Xoá mục xong`
- Cột trái:
  - khu nạp video
  - thống kê hàng đợi
  - danh sách video đang chờ hoặc đã xử lý
- Khu làm việc bên phải:
  - ảnh xem trước
  - cấu hình xử lý
  - khu kết quả sau khi xuất xong

## 3. Quy trình chuẩn

### Bước 1: Thêm video

Bạn có thể thêm video theo 3 cách:

- kéo thả file vào khu `Thả file video vào đây`
- bấm `Duyệt`
- dán đường dẫn tuyệt đối rồi bấm `Thêm`

Sau khi thêm, app sẽ tự:

- đọc thông tin video
- tạo ảnh preview
- chọn preset phù hợp theo đúng kích thước video

### Bước 2: Kiểm tra video đang chọn

Khi chọn một video trong hàng đợi, app sẽ hiển thị:

- tên file
- trạng thái hiện tại
- chế độ xử lý đang dùng
- preset tự động đang áp dụng
- độ phân giải, orientation, codec, thời lượng và fps

Nếu preview chưa hiện ngay, hãy chờ vài giây để app hoàn tất bước đọc file.

### Bước 3: Chọn cách xử lý

App có 2 chế độ:

#### Cắt tự động

Đây là chế độ nên dùng đầu tiên để xoá watermark cố định ở góc.

Thiết lập chính:

- `Cắt mép phải (px)`
- `Cắt mép dưới (px)`
- `Phóng lại về kích thước gốc`

Khuyến nghị:

- dùng nút `Khôi phục preset tự động` nếu bạn muốn quay về cấu hình đề xuất
- giữ bật `Phóng lại về kích thước gốc` để video xuất ra vẫn có đúng resolution ban đầu

#### Chèn logo

Dùng khi bạn muốn đặt logo mới đè lên video.

Thiết lập chính:

- đường dẫn ảnh logo
- `X`, `Y`, `W`, `H`
- `Độ mờ`

Mẹo:

- có thể kéo logo trực tiếp trên ảnh xem trước để thay đổi vị trí
- nên dùng ảnh PNG nền trong suốt để kết quả sạch hơn

### Bước 4: Cấu hình mã hoá và đầu ra

Trong phần `Mã hoá`:

- `preset`
  - `slow`: chất lượng tốt hơn, xử lý lâu hơn
  - `medium`: cân bằng
  - `fast`: nhanh hơn, thường phù hợp khi cần xuất thử
- `CRF`
  - số càng thấp thì chất lượng càng cao và file càng nặng
  - mặc định `16` là mức khá đẹp

Trong phần `Xuất file`:

- `Đường dẫn đầu ra`: nơi lưu file mới
- `Tự tải xuống khi hoàn tất`: hữu ích khi chạy trong trình duyệt

### Bước 5: Xuất video

- bấm `Bắt đầu xuất`
- theo dõi tiến trình ở cột trái và thanh trạng thái dưới cùng
- khi xong, app sẽ hiện:
  - `Xem video`
  - `Tải về`
  - `Mở thư mục`

## 4. Xử lý hàng loạt

Nếu bạn có nhiều video cùng loại:

1. Chỉnh cấu hình cho một video mẫu.
2. Bấm `Áp dụng thiết lập cho toàn bộ video đang chờ`.
3. Chạy `Bắt đầu xuất`.

Cách này phù hợp khi:

- watermark nằm cùng một vị trí trên toàn bộ video
- bạn muốn dùng cùng một thư mục đầu ra
- bạn cần tiết kiệm thời gian chỉnh từng file

## 5. Khi nào nên dùng từng chế độ

Nên dùng `Cắt tự động` khi:

- watermark bám ở cạnh phải hoặc cạnh dưới
- bạn muốn kết quả ổn định và ít phải tinh chỉnh

Nên dùng `Chèn logo` khi:

- bạn muốn thêm logo thương hiệu mới
- bạn muốn che một vùng nhỏ bằng ảnh logo

## 6. Lỗi thường gặp

### Không thấy preview

Kiểm tra:

- file video có tồn tại thật không
- đường dẫn có phải đường dẫn tuyệt đối không
- máy có `ffmpeg` và `ffprobe` hay bản Electron đã đóng gói đúng chưa

### Không thêm được video trong trình duyệt

Ở chế độ trình duyệt thường, hãy dán đường dẫn tuyệt đối thay vì chỉ kéo file từ một số trình quản lý tệp không cung cấp `path`.

### Chèn logo nhưng không thấy logo

Kiểm tra:

- đường dẫn ảnh logo có đúng không
- ảnh có đọc được không
- `W` và `H` có quá nhỏ không
- `X`, `Y` có nằm ngoài khung hình không

### Video xuất ra bị cắt quá nhiều

Hãy:

- bấm `Khôi phục preset tự động`
- giảm giá trị `Cắt mép phải` và `Cắt mép dưới`
- kiểm tra lại preview trước khi chạy cả hàng đợi

## 7. Gợi ý sử dụng an toàn

- luôn thử trước với 1 video mẫu
- kiểm tra file đầu ra trước khi chạy hàng loạt
- giữ nguyên file gốc, không ghi đè lên source
- nếu cùng một watermark nhưng video khác resolution, hãy xem app đang dùng preset nào

## 8. Tệp đầu ra nằm ở đâu

Mặc định:

- file đầu ra nằm cùng thư mục với file gốc
- tên file được thêm hậu tố `_no_logo`

Ví dụ:

- đầu vào: `video.mp4`
- đầu ra: `video_no_logo.mp4`

## 9. Video hướng dẫn

Video hướng dẫn sử dụng nằm tại:

- [output/tutorial/huong-dan-su-dung.mp4](/Users/tai/Desktop/remote_logo/output/tutorial/huong-dan-su-dung.mp4)
- Nếu cần dựng lại video sau này, chạy: [scripts/build_tutorial_video.sh](/Users/tai/Desktop/remote_logo/scripts/build_tutorial_video.sh)
