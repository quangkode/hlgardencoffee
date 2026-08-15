# ☕ Hệ thống chấm công & quản lý nhân sự quán cà phê

Web app chạy trên **Google Apps Script + Google Sheets**. Không cần server, không cần
tên miền, không tốn phí hosting. Toàn bộ dữ liệu nằm trong **một file Google Sheets**
của bạn — mở ra xem, lọc, in, xuất Excel bất cứ lúc nào.

Thiết kế **ưu tiên điện thoại** (mobile-first), máy tính vẫn dùng tốt.

> 📄 Hướng dẫn này còn có bản trang web dễ đọc trên điện thoại: mở file
> [`huong-dan.html`](huong-dan.html) bằng trình duyệt, có tick từng bước và thanh tiến độ.

---

## 1. Có gì trong này

| Tính năng | Nhân viên | Quản lý |
|---|---|---|
| Chấm công vào/ra theo giờ máy chủ + GPS | ✅ | ✅ |
| Báo ca (đăng ký lịch làm) | ✅ đăng ký | ✅ duyệt / xếp ca |
| Theo dõi kết quả làm việc & lương | ✅ của mình | ✅ toàn quán |
| Kiểm kho cuối ca | ✅ nhập phiếu | ✅ xem hao hụt, quy ra tiền |
| Giao ca (doanh thu, quỹ tiền mặt) | ✅ lập & xác nhận | ✅ tổng hợp |
| Bảng lương, thưởng/phạt, chốt lương | — | ✅ |
| Quản lý nhân viên, ca làm, cài đặt quán | — | ✅ |

**Chống gian lận chấm công:**
- Giờ lấy từ **máy chủ Google**, không lấy từ điện thoại → sửa giờ máy không ăn thua.
- Kiểm tra **GPS** so với toạ độ quán, có bán kính cho phép. Ngoài vùng thì gắn cờ đỏ
  cho quản lý xem, hoặc chặn hẳn (tuỳ bạn chọn).
- Tuỳ chọn **bắt chụp ảnh** khi chấm công (ảnh lưu vào Google Drive của bạn).
- Mọi thao tác đều ghi vào sheet `NhatKy`.

---

## 2. Cài đặt (làm 1 lần, khoảng 10 phút)

### Bước 1 — Tạo file dữ liệu
1. Vào [sheets.new](https://sheets.new) tạo một Google Sheets mới.
2. Đặt tên, ví dụ `DATA - Chấm công quán`.

### Bước 2 — Mở trình soạn code
Trên file Sheets vừa tạo: **Tiện ích mở rộng (Extensions) → Apps Script**.

### Bước 3 — Dán code vào
Trong Apps Script, xoá file `Code.gs` mẫu có sẵn, rồi tạo lần lượt các file dưới đây
(bấm dấu **+** cạnh chữ *Files*) và dán nội dung từ thư mục [apps-script/](apps-script/):

| Tạo kiểu | Tên file (gõ đúng, không cần đuôi) |
|---|---|
| Script | `Code`, `Db`, `Setup`, `Auth`, `ApiChamCong`, `ApiCa`, `ApiKho`, `ApiGiaoCa`, `ApiLuong`, `ApiQuanLy` |
| HTML | `Index`, `Css`, `JsCore`, `JsNhanVien`, `JsQuanLy` |

> **Lưu ý:** tên file phải chính xác từng chữ hoa/thường, vì code gọi lẫn nhau theo tên.

Sau đó bật hiện file cấu hình: biểu tượng **⚙ Project Settings** →
tick **"Show appsscript.json manifest file"** → quay lại tab Editor, mở `appsscript.json`
và dán nội dung từ [apps-script/appsscript.json](apps-script/appsscript.json).

### Bước 4 — Khởi tạo dữ liệu
1. Ở thanh trên, chọn hàm **`khoiTaoHeThong`** rồi bấm **Run**.
2. Google sẽ hỏi cấp quyền → **Review permissions** → chọn tài khoản của bạn →
   màn hình "Google hasn't verified this app" → **Advanced** → **Go to … (unsafe)** → **Allow**.
   *(Đây là app do chính bạn viết chạy trên tài khoản của bạn, nên an toàn.)*
3. Chạy xong, quay lại file Sheets sẽ thấy đủ 11 sheet và dữ liệu mẫu.

### Bước 5 — Xuất bản web app
1. Bấm **Deploy → New deployment**.
2. Bánh răng ⚙ cạnh *Select type* → chọn **Web app**.
3. Điền:
   - **Execute as:** `Me` (chính bạn)
   - **Who has access:** `Anyone`
4. Bấm **Deploy** → copy **Web app URL**.

> **"Anyone" có nguy hiểm không?** Không. Người có link chỉ mở được **màn hình đăng nhập**.
> Muốn vào phải có mã nhân viên + PIN. Đây là cách duy nhất để nhân viên dùng được mà
> không cần ai cũng phải có tài khoản Google.

### Bước 6 — Đăng nhập lần đầu
Mở link vừa copy trên điện thoại:

| Tài khoản | Mã | PIN |
|---|---|---|
| Quản lý | `QL001` | `1234` |
| Nhân viên mẫu | `NV001` | `1234` |

Hệ thống **bắt đổi PIN ngay lần đầu** — đổi xong mới dùng được.

### Bước 7 — Cấu hình quán
Đăng nhập bằng `QL001` → tab **Thêm ☰ → Cài đặt quán**:

1. **Đứng tại quán**, bấm *"Lấy vị trí hiện tại làm vị trí quán"*.
2. Đặt **bán kính chấm công** (gợi ý 100–200m; để `0` nếu không muốn kiểm tra vị trí).
3. Chỉnh lương/giờ mặc định, mức phạt trễ, phụ cấp ca…
4. Bấm **Lưu cài đặt**.

Rồi vào **Thêm ☰ → Nhân viên** để thêm người thật, và
**Cài đặt → Ca làm việc** để sửa giờ ca cho khớp quán bạn.

### Bước 8 — Phát cho nhân viên
Gửi link web app + mã NV + PIN `1234` cho từng người. Hướng dẫn họ:

- **iPhone (Safari):** bấm nút Chia sẻ → *Thêm vào MH chính*
- **Android (Chrome):** menu ⋮ → *Thêm vào màn hình chính*

Sau đó app hiện như một ứng dụng thật trên điện thoại.

---

## 3. Dùng hằng ngày

**Nhân viên**
1. Đến quán → mở app → **CHẤM CÔNG VÀO**
2. Cuối ca: nhập **Kiểm kho** → lập **Giao ca** → **CHẤM CÔNG RA**
3. Tab **Của tôi** xem giờ công và lương tạm tính bất cứ lúc nào.

**Quản lý**
1. Tab **Tổng quan** — ai đang trong ca (tự cập nhật 25 giây/lần), ai đi trễ, ai chấm
   ngoài vùng, hàng sắp hết, doanh thu & lệch quỹ hôm nay.
2. Tab **Chấm công** — sửa/thêm/xoá công khi nhân viên quên bấm.
3. Tab **Lương** — xem chi tiết từng người, thêm thưởng/phạt, **Chốt lương** cuối tháng.
4. **Thêm ☰ → Lịch ca** — duyệt ca nhân viên báo, hoặc tự xếp ca.

---

## 4. Công thức tính lương

Với mỗi ca đã hoàn thành:

```
tiền ca = (số phút làm ÷ 60) × lương/giờ × hệ số ca
phụ cấp = phụ cấp ca      (nếu làm ≥ ngưỡng phút, mặc định 240 phút)
phạt trễ = (số phút trễ − số phút được bỏ qua) × mức phạt mỗi phút
```

Cả tháng:

```
THỰC NHẬN = Σ tiền ca + Σ phụ cấp + thưởng − phạt − phạt trễ
```

- **Hệ số ca** đặt riêng cho từng ca (ví dụ ca tối ×1.2, ca đêm ×1.5).
- **Số phút nghỉ giữa ca** được trừ ra khỏi công.
- **Thưởng / phạt** quản lý nhập tay theo tháng, có ghi lý do.
- **Ca qua đêm** (giờ kết thúc < giờ bắt đầu) được tính đúng, ghi vào ngày bắt đầu ca.

---

## 5. Cấu trúc dữ liệu (11 sheet)

| Sheet | Nội dung |
|---|---|
| `NhanVien` | Nhân sự, lương/giờ, vai trò, PIN đã băm |
| `CaLamViec` | Định nghĩa ca: giờ, nghỉ giữa ca, hệ số lương |
| `LichLamViec` | Báo ca / xếp ca và trạng thái duyệt |
| `ChamCong` | Từng lượt vào/ra, GPS, số phút công, trễ, về sớm |
| `DanhMucHang` | Mặt hàng, đơn vị, tồn định mức, giá vốn |
| `KiemKho` | Từng dòng kiểm kho: tồn trước, nhập, thực tế, hao hụt |
| `GiaoCa` | Biên bản giao ca: doanh thu, quỹ tiền mặt, chênh lệch |
| `ThuongPhat` | Thưởng/phạt thủ công theo tháng |
| `BangLuong` | Kết quả chốt lương từng tháng |
| `CaiDat` | Toàn bộ cấu hình quán |
| `NhatKy` | Nhật ký mọi thao tác |

Bạn **sửa trực tiếp trên Sheets được** — app đọc lại ngay. Nhưng đừng đổi tên cột
hoặc xoá dòng tiêu đề.

---

## 6. Câu hỏi thường gặp

**Nhân viên quên PIN?**
Quản lý → **Nhân viên** → chọn người → *Reset PIN về 1234*.
Hoặc ngay trên Sheets: menu **☕ Chấm công → Reset PIN**.

**Quên luôn PIN quản lý?**
Trên file Sheets: menu **☕ Chấm công → Tạo lại tài khoản quản lý QL001** (PIN về `1234`).

**Nhân viên quên chấm ra?**
Tổng quan sẽ cảnh báo đỏ. Vào tab **Chấm công**, bấm vào dòng đó và điền giờ ra.

**Sửa code rồi, sao app không đổi?**
Phải deploy lại: **Deploy → Manage deployments** → bấm ✏️ → *Version* chọn **New version**
→ **Deploy**. Làm cách này thì **link cũ giữ nguyên**, không phải gửi lại cho nhân viên.
(Bấm *New deployment* sẽ tạo link mới — đừng làm vậy.)

**Nhân viên chấm công hộ nhau được không?**
Có thể, nếu cho mượn PIN. Muốn chặt hơn: bật **"Bắt chụp ảnh khi chấm công"** trong
Cài đặt — mỗi lượt chấm công sẽ có ảnh selfie kèm giờ, lưu trên Drive.

**Bao nhiêu người dùng được?**
Thoải mái cho quán 5–30 nhân viên. Google Apps Script miễn phí cho phép ~20.000
lượt gọi/ngày, dư sức.

**Có tốn tiền không?**
Không. Chỉ cần một tài khoản Google thường.

---

## 7. Giới hạn cần biết

- Cập nhật "đang trong ca" là **poll mỗi 25 giây**, không phải websocket — Apps Script
  không hỗ trợ kết nối thường trực. Với quán cà phê thì thừa nhanh.
- GPS điện thoại sai số 10–50m tuỳ máy và vị trí. Đừng đặt bán kính dưới 100m,
  kẻo nhân viên đứng đúng trong quán vẫn bị báo ngoài vùng.
- Nếu dùng trong nhà, tín hiệu GPS yếu → nên để chế độ **cảnh báo** (`chanNgoaiVung = FALSE`)
  thay vì chặn hẳn, tránh nhân viên không chấm công được.

---

## 8. Kiểm thử

Thư mục [kiem-thu/](kiem-thu/) chứa bộ giả lập môi trường Apps Script chạy bằng Node,
với **111 test** phủ toàn bộ nghiệp vụ (đăng nhập, phân quyền, chấm công, ca qua đêm,
lương, kiểm kho, giao ca). Chạy sau mỗi lần sửa code:

```bash
node kiem-thu/test.js apps-script
```
