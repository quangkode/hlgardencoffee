# ☕ Chấm công quán cà phê

Web app quản lý nhân sự cho quán cà phê nhỏ: **chấm công, báo ca, kiểm kho, giao ca
và tính lương**. Chạy trên **Vercel**, dữ liệu lưu trong **Google Sheets** của bạn.

Thiết kế **ưu tiên điện thoại**, máy tính vẫn dùng tốt. Nhân viên mở bằng link,
không cần cài app, không cần tài khoản Google.

> 📄 Bản hướng dẫn dễ đọc trên điện thoại: mở [`huong-dan.html`](huong-dan.html) bằng trình duyệt.

---

## 1. Có gì

| Tính năng | Nhân viên | Quản lý |
|---|---|---|
| Chấm công vào/ra theo giờ máy chủ + GPS | ✅ | ✅ |
| Báo ca (đăng ký lịch làm) | ✅ đăng ký | ✅ duyệt / xếp ca |
| Theo dõi giờ công & lương | ✅ của mình | ✅ toàn quán |
| Kiểm kho cuối ca | ✅ nhập phiếu | ✅ xem hao hụt, quy ra tiền |
| Giao ca (doanh thu, quỹ tiền mặt) | ✅ lập & xác nhận | ✅ tổng hợp |
| Bảng lương, thưởng/phạt, chốt lương | — | ✅ |
| Quản lý nhân viên, ca làm, cài đặt quán | — | ✅ |

**Chống gian lận chấm công**

- Giờ lấy từ **máy chủ**, không lấy từ điện thoại → sửa giờ máy không ăn thua.
- Kiểm tra **GPS** so với toạ độ quán, có bán kính cho phép. Ngoài vùng thì gắn cờ đỏ
  cho quản lý xem, hoặc chặn hẳn — tuỳ bạn chọn.
- Mọi thao tác, kể cả quản lý sửa công, đều ghi vào sheet `NhatKy`.

**Bảo mật**

- Đăng nhập bằng mã nhân viên + PIN. PIN băm bằng **scrypt** kèm salt riêng cho từng
  người và một chuỗi bí mật (pepper) nằm ngoài bảng tính — file Sheets có lọt ra ngoài
  cũng không dò ngược được PIN.
- Phiên đăng nhập ký HMAC, hết hạn theo cài đặt, đổi PIN là phiên cũ chết ngay.
- Khoá tạm 10 phút sau 5 lần sai PIN.
- Bắt buộc đổi PIN ở lần đăng nhập đầu.

---

## 2. Cài đặt

Cần khoảng 20 phút. Làm bằng **Gmail cá nhân**, đừng dùng tài khoản trường hay công ty —
dữ liệu sẽ thuộc về tổ chức đó và quản trị viên có quyền xoá.

### Bước 1 — Tạo file Google Sheets

1. Vào [sheets.new](https://sheets.new), đặt tên ví dụ `DATA - Chấm công quán`.
2. Nhìn thanh địa chỉ, copy đoạn ID giữa `/d/` và `/edit`:

```
https://docs.google.com/spreadsheets/d/  1AbC...XyZ  /edit
                                         └── đây là GOOGLE_SHEET_ID
```

Không cần tự tạo sheet con hay tiêu đề — app tự tạo đủ 11 sheet ở lần chạy đầu.

### Bước 2 — Tạo service account

Đây là "tài khoản máy" để Vercel thay bạn ghi vào Sheets.

1. Vào [console.cloud.google.com](https://console.cloud.google.com) → tạo project mới,
   đặt tên gì cũng được.
2. Tìm ô tìm kiếm trên cùng, gõ **Google Sheets API** → mở ra → bấm **Enable**.
3. Vào **APIs & Services → Credentials** → **Create Credentials** → **Service account**.
   - Đặt tên bất kỳ, ví dụ `chamcong`, bấm **Done**.
4. Bấm vào service account vừa tạo → tab **Keys** → **Add key** → **Create new key**
   → chọn **JSON** → **Create**. Máy sẽ tải về một file `.json`.
5. Mở file JSON đó bằng Notepad. Bạn cần đúng 2 giá trị:
   - `client_email` → dạng `chamcong@ten-project.iam.gserviceaccount.com`
   - `private_key`  → chuỗi dài bắt đầu bằng `-----BEGIN PRIVATE KEY-----`

### Bước 3 — Cho service account quyền vào file Sheets

Mở lại file Sheets ở Bước 1 → nút **Chia sẻ** → dán `client_email` vào →
chọn quyền **Người chỉnh sửa** → **Gửi**.

> Bỏ qua bước này là app báo lỗi *"Service account chưa có quyền vào file Sheets"*.

### Bước 4 — Đưa lên Vercel

1. Vào [vercel.com](https://vercel.com), đăng nhập bằng GitHub.
2. **Add New → Project** → chọn repo `hlgardencoffee` → **Import**.
3. Phần *Framework Preset* để **Other**. Không cần sửa gì khác.
4. Mở mục **Environment Variables**, thêm 5 biến:

| Tên biến | Giá trị |
|---|---|
| `GOOGLE_SHEET_ID` | ID lấy ở Bước 1 |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` ở Bước 2 |
| `GOOGLE_PRIVATE_KEY` | `private_key` ở Bước 2 — dán **cả** dòng `-----BEGIN...` và `-----END...` |
| `PIN_PEPPER` | Một chuỗi ngẫu nhiên bạn tự đặt, càng dài càng tốt |
| `TOKEN_SECRET` | Một chuỗi ngẫu nhiên khác |

Cần chuỗi ngẫu nhiên? Mở tab mới, bấm F12, dán vào Console rồi Enter:

```js
crypto.randomUUID() + crypto.randomUUID()
```

5. Bấm **Deploy**, chờ khoảng một phút.

### Bước 5 — Đăng nhập

Mở link Vercel vừa cấp (dạng `ten-du-an.vercel.app`) trên điện thoại:

| Tài khoản | Mã | PIN |
|---|---|---|
| Quản lý | `QL001` | `1234` |
| Nhân viên mẫu | `NV001` | `1234` |

Hệ thống **bắt đổi PIN ngay lần đầu**. Lượt mở đầu tiên hơi lâu vì app đang tự tạo
11 sheet và dữ liệu mẫu — mở lại file Sheets sẽ thấy.

### Bước 6 — Cấu hình quán

Đăng nhập `QL001` → tab **Thêm ☰ → Cài đặt quán**:

1. **Đứng tại quán**, bấm *"Lấy vị trí hiện tại làm vị trí quán"*.
2. Đặt **bán kính chấm công** — gợi ý 100–200m. Để `0` nếu không muốn kiểm tra vị trí.
3. Sửa lương/giờ mặc định cho đúng quán bạn.

Rồi vào **Nhân viên** thêm người thật, **Cài đặt → Ca làm việc** sửa giờ ca cho khớp.

### Bước 7 — Phát cho nhân viên

Gửi link kèm mã nhân viên và PIN `1234`. Bảo họ thêm vào màn hình chính:

- **iPhone / Safari** — nút Chia sẻ → *Thêm vào MH chính*
- **Android / Chrome** — menu ⋮ → *Thêm vào màn hình chính*

---

## 3. Công thức lương

Ca nào cũng như ca nào, cứ giờ công nhân lương giờ:

```
tiền ca   = (số phút làm ÷ 60) × lương/giờ
THỰC NHẬN = Σ tiền ca + thưởng − phạt
```

Với mức mặc định 25.000đ/giờ: làm 6 tiếng được 150.000đ, ca sáng hay ca đêm đều vậy.

- **Không hệ số ca, không phạt tiền đi trễ.** Số phút trễ vẫn ghi lại và hiện cho
  quản lý theo dõi, nhưng không trừ lương.
- **Nghỉ giữa ca** được trừ khỏi giờ công.
- **Ca qua đêm** tính đúng, ghi vào ngày bắt đầu ca.
- **Thưởng / phạt** quản lý nhập tay theo tháng — cách duy nhất tiền bị cộng trừ
  ngoài giờ công.
- **Phụ cấp ca** mặc định tắt. Muốn thưởng thêm mỗi ca đủ giờ thì bật trong Cài đặt.

---

## 4. Dữ liệu

Tất cả nằm trong một file Google Sheets của bạn — mở ra xem, lọc, in, xuất Excel bất cứ
lúc nào. Sửa tay trên Sheets cũng được, app đọc lại ngay.

| Sheet | Chứa gì |
|---|---|
| `NhanVien` | Nhân sự, lương/giờ, vai trò, PIN đã băm |
| `CaLamViec` | Định nghĩa ca: giờ, nghỉ giữa ca |
| `LichLamViec` | Báo ca / xếp ca và trạng thái duyệt |
| `ChamCong` | Từng lượt vào/ra, GPS, phút công, trễ, về sớm |
| `DanhMucHang` | Mặt hàng, đơn vị, tồn định mức, giá vốn |
| `KiemKho` | Tồn trước, nhập thêm, thực tế, hao hụt |
| `GiaoCa` | Doanh thu, quỹ tiền mặt, chênh lệch từng ca |
| `ThuongPhat` | Thưởng / phạt thủ công theo tháng |
| `BangLuong` | Kết quả chốt lương từng tháng |
| `CaiDat` | Toàn bộ cấu hình quán |
| `NhatKy` | Nhật ký mọi thao tác |

> ⚠️ Đừng đổi tên cột hoặc xoá dòng tiêu đề — app đọc dữ liệu theo tên cột.

---

## 5. Cấu trúc mã nguồn

```
index.html          Toàn bộ giao diện (HTML + CSS + JS thuần, không cần build)
api/index.js        Cổng API duy nhất, định tuyến mọi thao tác
api/_lib/core.js    Kết nối Google Sheets, ảnh chụp dữ liệu, tiện ích
api/_lib/auth.js    Băm PIN, token phiên, đăng nhập
api/_lib/setup.js   Khởi tạo sheet và dữ liệu mẫu lần đầu
api/_lib/business.js Nghiệp vụ: chấm công, ca, kho, giao ca, lương
kiem-thu/           Bộ kiểm thử + giả lập Google Sheets API
apps-script/        Bản Apps Script cũ, đã ngừng dùng — giữ lại tham khảo
```

Không dùng framework, **không có thư viện phụ thuộc nào**. JWT gọi Google API được ký
thẳng bằng `node:crypto`, nên hàm khởi động nhanh và không dính lỗ hổng của gói ngoài.

**Cách tối ưu tốc độ:** mỗi lượt gọi API nạp đúng những sheet cần dùng trong một lần
`batchGet`, chạy toàn bộ nghiệp vụ đồng bộ trên bộ nhớ, rồi gom mọi thay đổi ghi ngược
một lượt. Bảng tổng quan của quản lý — vốn đụng 8 sheet — chỉ tốn **một vòng mạng**.

### Kiểm thử

**119 test** phủ toàn bộ nghiệp vụ, chạy qua chính handler API thật với lớp Google
Sheets giả lập, nên bắt được cả lỗi ở tầng ghi dữ liệu:

```bash
node kiem-thu/test.js
```

---

## 6. Câu hỏi thường gặp

**Nhân viên quên PIN?**
Quản lý → **Nhân viên** → chọn người → *Reset PIN về 1234*.

**Quên PIN quản lý, không ai vào được nữa?**
Mở file Sheets → sheet `NhanVien` → xoá dòng của `QL001` → vào Vercel bấm **Redeploy**.
App sẽ tạo lại `QL001` với PIN `1234`. Các nhân viên khác không bị ảnh hưởng.

**Sửa code thì cập nhật thế nào?**
`git push` là xong — Vercel tự deploy, link giữ nguyên.

**Đổi `PIN_PEPPER` được không?**
⚠️ **Không.** Đổi là toàn bộ PIN hiện có mất hiệu lực, không ai đăng nhập được nữa.
Nếu lỡ đổi: xoá hết dòng trong sheet `NhanVien` (giữ dòng tiêu đề), Redeploy để tạo
lại `QL001`, rồi thêm lại nhân viên.

**Chi phí?**
Miễn phí. Vercel gói Hobby và Google Sheets API đều thừa cho quán 5–30 người.

**App chậm ở lần mở đầu tiên?**
Bình thường. Vercel cho hàm ngủ khi không ai dùng, lần gọi đầu mất 1–2 giây để đánh
thức. Các lần sau nhanh ngay.

---

## 7. Giới hạn cần biết

- **Không phải thời gian thực tuyệt đối.** Màn hình "đang trong ca" hỏi lại máy chủ mỗi
  25 giây. Với quán cà phê thì thừa nhanh.
- **GPS sai số 10–50m** tuỳ máy. Đừng đặt bán kính dưới 100m, kẻo nhân viên đứng ngay
  trong quán vẫn bị báo ngoài vùng. Trong nhà tín hiệu yếu thì nên để chế độ cảnh báo
  thay vì chặn hẳn.
- **Chưa có chụp ảnh khi chấm công.** Bản Apps Script cũ lưu ảnh vào Google Drive;
  service account không có dung lượng Drive riêng nên tính năng này tạm bỏ. Cần thì
  gắn thêm Vercel Blob sau.
- **Không khoá ghi đồng thời.** Hai người thao tác đúng cùng một giây trên cùng một
  dòng có thể giẫm chân nhau. Thêm dòng mới thì luôn an toàn; sửa và xoá chỉ quản lý
  làm nên xác suất gần như không có.
- **Dọn dữ liệu mỗi năm.** Sheet `KiemKho` và `NhatKy` phình nhanh nhất. Khi `ChamCong`
  vượt khoảng 20.000 dòng, nên cắt dữ liệu năm cũ sang file lưu trữ riêng.
