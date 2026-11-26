# 🎨 Checklist giao diện

Kiểm tra tay trên **điện thoại thật** (iPhone Safari + Android Chrome) và máy tính.
Tick `[x]` khi đạt.

---

## 1. Kích thước màn hình

- [ ] Điện thoại nhỏ (360px) — không tràn ngang, không phải cuộn ngang
- [ ] Điện thoại lớn (430px)
- [ ] Máy tính bảng (~768px) — lưới 2 cột hiển thị đẹp
- [ ] Máy tính (>900px) — app nằm giữa, có bóng đổ, không kéo giãn quá rộng
- [ ] Xoay ngang điện thoại vẫn dùng được
- [ ] iPhone có tai thỏ / thanh Home: header và tab bar không bị che (safe-area)

## 2. Chế độ sáng / tối

- [ ] Chế độ sáng: chữ đủ tương phản trên nền kem
- [ ] Chế độ tối: không còn ô trắng chói, không chữ tối trên nền tối
- [ ] Màu trạng thái (xanh ok / cam cảnh báo / đỏ lỗi / xanh dương info) rõ ở cả 2 chế độ
- [ ] Ô nhập, select, date/time picker đọc được trong chế độ tối

## 3. Màn hình chung

- [ ] Splash hiện tên quán khi đang tải
- [ ] Màn đăng nhập: bàn phím số khi gõ PIN, nút Đăng nhập đủ to
- [ ] Header: avatar, tên, vai trò, nút tải lại, nút đăng xuất không chồng nhau
- [ ] Marquee người bị phạt chạy mượt, không đẩy lệch layout, ẩn khi không có ai
- [ ] Header dính (sticky) khi cuộn
- [ ] Tab bar dưới: 5 tab, icon + chữ, tab đang mở được tô sáng
- [ ] Tên dài (tên quán, họ tên) bị cắt "…" thay vì xuống dòng phá layout

## 4. Thành phần dùng chung

- [ ] **Toast**: hiện rồi tự tắt, không che nút quan trọng
- [ ] **Loading**: hiện khi gọi API, chặn bấm 2 lần
- [ ] **Bottom sheet / modal**: trượt lên trên điện thoại, nằm giữa trên máy tính
- [ ] Modal dài cuộn được bên trong, nút Lưu không bị đẩy khuất
- [ ] Nút × và bấm ra ngoài để đóng hoạt động
- [ ] **Hộp xác nhận** (xoá, chốt lương…) có nút Huỷ / Đồng ý rõ ràng, nút nguy hiểm màu đỏ
- [ ] **Trạng thái trống** (empty) có icon + câu giải thích
- [ ] **Trạng thái lỗi** khi mất mạng / API lỗi có nút thử lại
- [ ] Tabs con (Kho: Tạo phiếu/Lịch sử; QL Kho: 5 tab) chuyển mượt, tab đang chọn rõ
- [ ] Panel chi tiết (detail-panel) trượt từ dưới lên trên điện thoại

## 5. Form & nhập liệu

- [ ] Ô số mở bàn phím số (`inputmode`)
- [ ] Ô tiền hiển thị định dạng có dấu chấm ngăn cách (150.000)
- [ ] Nhãn (label) luôn hiện phía trên ô, có placeholder ví dụ
- [ ] Lỗi nhập liệu báo ngay cạnh ô hoặc bằng toast dễ hiểu
- [ ] Bàn phím bật lên không che ô đang nhập
- [ ] Vùng bấm tối thiểu ~44px, các nút không quá sát nhau

## 6. Từng màn hình — Nhân viên

- [ ] **Chấm công**: đồng hồ to, nút Vào/Ra nổi bật, đổi màu theo trạng thái
- [ ] Cảnh báo ngoài vùng GPS dễ thấy
- [ ] **Ca của tôi**: lưới báo ca 2 tuần dễ chọn, đếm số ca đã chọn
- [ ] **Kiểm kho**: 3 nút Kiểm / Nhập / Xuất phân biệt rõ
- [ ] Lưới chọn món (nhập/xuất) có ô tìm kiếm, cuộn mượt với danh sách dài
- [ ] **Giao ca**: form dài vẫn dễ đọc, kết quả chênh lệch tô màu (thừa/thiếu)
- [ ] **Của tôi**: bảng tính chi tiết không tràn ngang; thưởng xanh, phạt đỏ

## 7. Từng màn hình — Quản lý

- [ ] **Tổng quan**: thẻ cảnh báo sắp theo mức độ, bấm được, số liệu to rõ
- [ ] Danh sách đang trong ca cập nhật trực tiếp
- [ ] **Chấm công**: bộ lọc ngày/nhân viên gọn trên 1–2 dòng; lượt ngoài vùng có cờ đỏ
- [ ] **Lương**: bảng nhiều người đọc được trên điện thoại (cuộn hoặc dạng thẻ)
- [ ] **Kho — Báo cáo tổng**: món hết / sắp hết phân màu, chọn tháng dễ
- [ ] **Kho — Danh mục**: tìm kiếm, lọc nhóm, lọc "hết hàng", hiện số đếm
- [ ] Nhập Excel: hiện kết quả (số ngày / số món đã nhập, ngày bỏ qua)
- [ ] **Thêm ☰**: menu có icon + mô tả ngắn, nút "Quay lại" ở các trang con
- [ ] **Lịch ca**: lịch tuần đọc được, phân biệt chờ duyệt / đã duyệt
- [ ] **Cài đặt**: nút lấy GPS báo kết quả toạ độ ngay dưới

## 8. Chữ & ngôn ngữ

- [ ] Toàn bộ tiếng Việt có dấu, không lỗi font / ký tự lạ
- [ ] Ngày dạng dd/mm/yyyy, tháng dạng "Tháng 11/2026"
- [ ] Không còn chữ tiếng Anh sót lại hoặc mã kỹ thuật (maNV, undefined, NaN…)
- [ ] Icon emoji hiển thị đúng trên cả iOS và Android

## 9. Trải nghiệm

- [ ] Thêm vào màn hình chính (iOS / Android) có icon và mở toàn màn hình
- [ ] Nút tải lại làm mới dữ liệu màn hiện tại, không đá về trang đầu
- [ ] Mạng chậm (3G): có loading, không trắng màn
- [ ] Chuyển tab nhanh không bị nháy hoặc hiện dữ liệu của tab cũ
- [ ] Phóng to chữ hệ thống (accessibility) không vỡ layout
