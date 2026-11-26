# ✅ Checklist tính năng

Dùng để kiểm thử tay trước mỗi lần deploy. Tick `[x]` khi đã thử và chạy đúng.
Tài khoản thử: `QL001` (quản lý), `NV001` (nhân viên).

---

## 1. Đăng nhập & tài khoản

- [ ] Đăng nhập đúng mã + PIN → vào được app
- [ ] Sai PIN → báo lỗi, không lộ thông tin "mã có tồn tại hay không"
- [ ] Sai PIN 5 lần → khoá tạm 10 phút
- [ ] Lần đầu đăng nhập (PIN `1234`) → bắt buộc đổi PIN, không đóng được hộp thoại
- [ ] Đổi PIN: PIN cũ sai / PIN mới không khớp / PIN < 4 số → báo lỗi
- [ ] Đổi PIN xong → phiên trên máy khác bị đăng xuất
- [ ] Phiên hết hạn theo cài đặt → tự về màn hình đăng nhập
- [ ] Đăng xuất → xoá phiên, bấm Back không vào lại được
- [ ] Nhân viên trạng thái "nghỉ việc" → không đăng nhập được
- [ ] Nhân viên gọi API `ql.*` → bị từ chối

## 2. Chấm công (nhân viên)

- [ ] Đồng hồ hiển thị theo giờ máy chủ, không theo giờ điện thoại
- [ ] Chấm vào → ghi giờ, GPS, ca vào sheet `ChamCong`
- [ ] Chấm ra → tính đúng số phút công (đã trừ nghỉ giữa ca)
- [ ] Chấm vào 2 lần liên tiếp → bị chặn
- [ ] Ca qua đêm → ghi vào ngày bắt đầu ca, phút công đúng
- [ ] Từ chối quyền GPS → thông báo rõ ràng
- [ ] Ngoài bán kính + chế độ **cảnh báo** → vẫn chấm được, gắn cờ đỏ
- [ ] Ngoài bán kính + chế độ **chặn** → không chấm được
- [ ] Bán kính = 0 → bỏ qua kiểm tra vị trí
- [ ] Màn hình "đang trong ca" tự cập nhật (~25 giây)
- [ ] Lịch sử chấm công của tôi hiển thị đúng

## 3. Báo ca / Ca của tôi

- [ ] Báo ca 2 tuần tới: chọn nhiều ô ca, đếm số ca đã chọn
- [ ] Gửi báo ca → trạng thái "chờ duyệt"
- [ ] Huỷ báo ca chưa duyệt được; ca đã duyệt thì không tự huỷ
- [ ] Ca đã được quản lý xếp/duyệt hiện đúng trong "Ca của tôi"

## 4. Kho (nhân viên)

- [ ] **Kiểm kho**: tạo phiếu, chọn ca, nhập số thực tế, gửi được
- [ ] **Nhập kho**: chọn ngày, tìm món, điền số lượng, gửi → chờ duyệt
- [ ] **Xuất kho**: chọn món trên lưới, điền số lượng, gửi → chờ duyệt
- [ ] **Kiểm đếm**: gửi được, chờ quản lý duyệt
- [ ] Phiếu chưa duyệt **không** làm thay đổi tồn kho
- [ ] Tab Lịch sử hiển thị phiếu đã gửi và trạng thái
- [ ] Ô số lượng bỏ trống / số âm → xử lý đúng

## 5. Giao ca

- [ ] Lập biên bản: tiền đầu ca, doanh thu, chuyển khoản, tiền mặt cuối ca, tiền nộp
- [ ] Nút "Tính" ra đúng chênh lệch quỹ
- [ ] Chọn người nhận → người đó thấy biên bản "chờ tôi xác nhận"
- [ ] Người nhận xác nhận → trạng thái cập nhật
- [ ] Không tự giao cho chính mình

## 6. Của tôi (lương cá nhân)

- [ ] Bảng giờ công theo tháng đúng với `ChamCong`
- [ ] Tiền ca = phút ÷ 60 × lương/giờ
- [ ] Thưởng/phạt trong tháng hiển thị và cộng trừ đúng
- [ ] Thực nhận = Σ tiền ca + thưởng − phạt
- [ ] Marquee người bị phạt chạy trên header

## 7. Quản lý — Tổng quan

- [ ] Các thẻ cảnh báo: quên chấm ra, ca chờ duyệt, phiếu kho chờ duyệt, giao ca chưa xác nhận, ngoài vùng, hàng dưới định mức
- [ ] Bấm vào cảnh báo → nhảy đúng tab
- [ ] Danh sách "đang trong ca" đúng thực tế
- [ ] Tải trong 1 vòng mạng (không chậm bất thường)

## 8. Quản lý — Chấm công

- [ ] Lọc theo khoảng ngày + nhân viên
- [ ] Sửa công (ngày, ca, giờ vào/ra, ghi chú) → phút công tính lại
- [ ] Nhập công thủ công cho nhân viên quên chấm
- [ ] Xoá lượt chấm công (có xác nhận)
- [ ] Mọi thao tác sửa/xoá ghi vào `NhatKy`

## 9. Quản lý — Lương

- [ ] Bảng lương toàn quán theo tháng
- [ ] Chi tiết từng người khớp với màn "Của tôi" của họ
- [ ] Thêm / sửa / xoá thưởng–phạt
- [ ] Chốt lương → ghi sheet `BangLuong`, không chốt trùng tháng
- [ ] Phụ cấp ca (nếu bật) cộng đúng ca đủ giờ

## 10. Quản lý — Kho

- [ ] **Báo cáo tổng**: món hết / sắp hết theo mức báo, nhập & dùng theo tháng
- [ ] Lưu mức báo sắp hết
- [ ] **Phiếu kiểm**: duyệt / từ chối, hao hụt quy ra tiền
- [ ] **Kiểm đếm**: duyệt
- [ ] **Nhập/Xuất**: duyệt → tồn kho cập nhật đúng
- [ ] **Danh mục**: thêm/sửa mặt hàng (đơn vị, nhóm, định mức, giá vốn, giá bán, trạng thái)
- [ ] Xoá mặt hàng; khôi phục món còn thiếu
- [ ] Nhập kho từ Excel: đúng khuôn sheet "10-8", tự tạo món mới, bỏ qua ngày đã nhập
- [ ] File Excel sai khuôn → báo lỗi dễ hiểu

## 11. Quản lý — Thêm ☰

- [ ] **Lịch ca**: xem theo khoảng ngày, duyệt/từ chối báo ca, xếp ca, xoá lịch
- [ ] **Gợi ý chia ca tự động** → xem trước → áp dụng
- [ ] **Giao ca**: xem tổng hợp theo khoảng ngày
- [ ] **Nhân viên**: thêm mới (PIN ban đầu), sửa, đổi trạng thái, reset PIN về 1234
- [ ] Mã nhân viên trùng → bị chặn
- [ ] **Cài đặt quán**: lấy GPS hiện tại làm vị trí quán, bán kính, lương mặc định, lưu
- [ ] **Ca làm việc**: thêm / sửa ca (giờ, nghỉ giữa ca)
- [ ] Quản lý dùng được "Chấm công của tôi", "Lương của tôi", "Kiểm kho"

## 12. Dữ liệu & hệ thống

- [ ] File Sheets trống → lần chạy đầu tự tạo đủ sheet + dữ liệu mẫu
- [ ] Sửa tay trên Sheets → app đọc lại đúng
- [ ] Thiếu biến môi trường / service account chưa share → thông báo lỗi rõ
- [ ] `node kiem-thu/test.js` chạy pass toàn bộ
- [ ] Hai người thao tác cùng lúc (thêm dòng) → không mất dữ liệu
