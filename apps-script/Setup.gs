/*******************************************************
 * Setup.gs — Khởi tạo hệ thống, menu trên Google Sheets
 *******************************************************/

const DEFAULT_SETTINGS = [
  ['tenQuan',            'Cà Phê Chị Thảo',  'Tên quán hiển thị trên app'],
  ['diaChiQuan',         '',                 'Địa chỉ quán'],
  ['latQuan',            '',                 'Vĩ độ quán — vào Cài đặt bấm "Lấy vị trí hiện tại" khi đang đứng ở quán'],
  ['lngQuan',            '',                 'Kinh độ quán'],
  ['banKinhChamCong',    '150',              'Bán kính cho phép chấm công (mét). Để trống hoặc 0 = không kiểm tra vị trí'],
  ['batBuocViTri',       'TRUE',             'TRUE = bắt buộc bật GPS mới chấm công được'],
  ['chanNgoaiVung',      'FALSE',            'TRUE = chặn hẳn nếu đứng ngoài bán kính. FALSE = vẫn cho chấm nhưng gắn cờ đỏ để quản lý xem'],
  ['yeuCauAnh',          'FALSE',            'TRUE = bắt chụp ảnh selfie khi chấm công (ảnh lưu vào Google Drive)'],
  ['phutTreChoPhep',     '5',                'Trễ quá bao nhiêu phút thì mới hiện cảnh báo cho quản lý (không trừ tiền)'],
  ['luongGioMacDinh',    '25000',            'Lương/giờ mặc định khi nhân viên chưa được set riêng'],
  ['phuCapCaMacDinh',    '0',                'Phụ cấp thêm mỗi ca làm đủ (đồng). Để 0 = chỉ tính lương theo giờ'],
  ['nguongPhutTinhPhuCap', '240',            'Làm tối thiểu bao nhiêu phút thì được tính phụ cấp ca (chỉ dùng khi có phụ cấp)'],
  ['lamTronPhut',        '5',                'Làm tròn số phút công lên/xuống theo bội số này (0 = không làm tròn)'],
  ['choPhepTuDangKyCa',  'TRUE',             'TRUE = nhân viên tự báo ca, quản lý duyệt'],
  ['hanBaoCaTruoc',      '1',                'Phải báo ca trước ít nhất bao nhiêu ngày'],
  ['batBuocKiemKhoCuoiCa', 'FALSE',          'TRUE = nhắc kiểm kho trước khi chấm công ra'],
  ['thoiGianPhienDangNhap', '720',           'Số phút giữ đăng nhập (720 = 12 tiếng)']
];

const DEFAULT_CA = [
  ['CA1', 'Ca sáng',  '06:00', '12:00', 0,  'HoatDong', ''],
  ['CA2', 'Ca chiều', '12:00', '18:00', 0,  'HoatDong', ''],
  ['CA3', 'Ca tối',   '18:00', '23:00', 0,  'HoatDong', ''],
  ['CAG', 'Ca gãy',   '09:00', '14:00', 30, 'HoatDong', 'Ca linh hoạt, nghỉ giữa ca 30 phút']
];

const DEFAULT_HANG = [
  ['H001', 'Cà phê hạt',        'kg',   'Nguyên liệu', 5,  180000, 'HoatDong'],
  ['H002', 'Sữa đặc',           'lon',  'Nguyên liệu', 10, 22000,  'HoatDong'],
  ['H003', 'Sữa tươi',          'hộp',  'Nguyên liệu', 12, 32000,  'HoatDong'],
  ['H004', 'Đường',             'kg',   'Nguyên liệu', 5,  20000,  'HoatDong'],
  ['H005', 'Trà đen',           'kg',   'Nguyên liệu', 2,  150000, 'HoatDong'],
  ['H006', 'Đá viên',           'bao',  'Nguyên liệu', 6,  15000,  'HoatDong'],
  ['H007', 'Ly nhựa size M',    'cái',  'Vật tư',      200, 900,   'HoatDong'],
  ['H008', 'Ly nhựa size L',    'cái',  'Vật tư',      200, 1200,  'HoatDong'],
  ['H009', 'Nắp ly',            'cái',  'Vật tư',      300, 400,   'HoatDong'],
  ['H010', 'Ống hút',           'cái',  'Vật tư',      300, 200,   'HoatDong'],
  ['H011', 'Bánh ngọt',         'cái',  'Hàng bán',    15, 12000,  'HoatDong'],
  ['H012', 'Nước suối',         'chai', 'Hàng bán',    24, 4000,   'HoatDong']
];

/**
 * CHẠY HÀM NÀY MỘT LẦN DUY NHẤT sau khi dán code vào Apps Script.
 * Nó tạo đủ các sheet, cài đặt mặc định và tài khoản quản lý đầu tiên.
 */
function khoiTaoHeThong() {
  const props = PropertiesService.getScriptProperties();

  // 1. Xác định file Sheets
  if (!props.getProperty('SPREADSHEET_ID')) {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) {
      props.setProperty('SPREADSHEET_ID', active.getId());
    } else {
      const created = SpreadsheetApp.create('DATA - Chấm Công Quán Cà Phê');
      props.setProperty('SPREADSHEET_ID', created.getId());
    }
  }

  // 2. Khoá bí mật ký token đăng nhập
  if (!props.getProperty('TOKEN_SECRET')) {
    props.setProperty('TOKEN_SECRET', Utilities.getUuid() + Utilities.getUuid());
  }
  if (!props.getProperty('PIN_PEPPER')) {
    props.setProperty('PIN_PEPPER', Utilities.getUuid());
  }

  // 3. Tạo sheet còn thiếu
  Object.keys(HEADERS).forEach(name => sheet_(name));

  // 4. Cài đặt mặc định (chỉ thêm key chưa có)
  const daCo = {};
  readAll_(SHEETS.CAIDAT).forEach(r => { daCo[String(r.key).trim()] = true; });
  const themCaiDat = DEFAULT_SETTINGS
    .filter(r => !daCo[r[0]])
    .map(r => ({ key: r[0], value: r[1], moTa: r[2] }));
  appendMany_(SHEETS.CAIDAT, themCaiDat);
  _cfgCache = null;

  // 5. Ca làm việc mặc định
  if (readAll_(SHEETS.CA).length === 0) {
    appendMany_(SHEETS.CA, DEFAULT_CA.map(r => ({
      maCa: r[0], tenCa: r[1], gioBatDau: r[2], gioKetThuc: r[3],
      soPhutNghi: r[4], trangThai: r[5], ghiChu: r[6]
    })));
  }

  // 6. Danh mục hàng mẫu
  if (readAll_(SHEETS.HANG).length === 0) {
    appendMany_(SHEETS.HANG, DEFAULT_HANG.map(r => ({
      maHang: r[0], tenHang: r[1], donVi: r[2], nhomHang: r[3],
      tonDinhMuc: r[4], giaVon: r[5], trangThai: r[6]
    })));
  }

  // 7. Tài khoản quản lý đầu tiên
  let msg = '';
  if (readAll_(SHEETS.NHANVIEN).length === 0) {
    taoNhanVien_({
      maNV: 'QL001', hoTen: 'Quản lý', soDienThoai: '', chucVu: 'QuanLy',
      luongTheoGio: 0, phuCapCa: 0, ngayVaoLam: today_(), ghiChu: 'Tài khoản khởi tạo'
    }, '1234');
    taoNhanVien_({
      maNV: 'NV001', hoTen: 'Nhân viên mẫu', soDienThoai: '', chucVu: 'NhanVien',
      luongTheoGio: 25000, phuCapCa: 20000, ngayVaoLam: today_(), ghiChu: 'Xoá được'
    }, '1234');
    msg = '\n\nTài khoản mặc định:\n  • Quản lý:   QL001 / PIN 1234\n  • Nhân viên: NV001 / PIN 1234\n(Hệ thống sẽ bắt đổi PIN ở lần đăng nhập đầu.)';
  }

  props.setProperty('SETUP_DONE', '1');

  const url = ScriptApp.getService().getUrl() || '(chưa Deploy — vào Deploy > New deployment > Web app)';
  const out = 'Khởi tạo xong!\n\nFile dữ liệu: ' + ss_().getUrl() + '\nĐịa chỉ web app: ' + url + msg;
  Logger.log(out);
  try { SpreadsheetApp.getUi().alert(out); } catch (e) {}
  return out;
}

function ensureSetup_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SETUP_DONE') === '1') return;
  khoiTaoHeThong();
}

/** Menu tiện dụng ngay trên file Google Sheets. */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('☕ Chấm công')
      .addItem('Khởi tạo / kiểm tra hệ thống', 'khoiTaoHeThong')
      .addItem('Lấy link web app', 'hienLinkWebApp')
      .addSeparator()
      .addItem('Reset PIN về 1234 cho 1 nhân viên', 'menuResetPin')
      .addItem('Tạo lại tài khoản quản lý QL001', 'menuTaoLaiQuanLy')
      .addToUi();
  } catch (e) {}
}

function hienLinkWebApp() {
  const url = ScriptApp.getService().getUrl();
  const ui = SpreadsheetApp.getUi();
  if (!url) {
    ui.alert('Chưa deploy. Vào Extensions > Apps Script > Deploy > New deployment > Web app.');
  } else {
    ui.alert('Link web app (gửi cho nhân viên):\n\n' + url);
  }
}

function menuResetPin() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Reset PIN', 'Nhập mã nhân viên cần reset PIN về 1234:', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const ma = res.getResponseText().trim();
  const nv = findBy_(SHEETS.NHANVIEN, 'maNV', ma);
  if (!nv) { ui.alert('Không tìm thấy nhân viên ' + ma); return; }
  const s = taoHashPin_('1234');
  patchRow_(SHEETS.NHANVIEN, nv._row, { pinHash: s.hash, pinSalt: s.salt, doiPinLanDau: 'TRUE' });
  ui.alert('Đã reset PIN của ' + ma + ' về 1234. Nhân viên sẽ phải đổi PIN khi đăng nhập.');
}

function menuTaoLaiQuanLy() {
  const ui = SpreadsheetApp.getUi();
  const nv = findBy_(SHEETS.NHANVIEN, 'maNV', 'QL001');
  if (nv) {
    const s = taoHashPin_('1234');
    patchRow_(SHEETS.NHANVIEN, nv._row, {
      chucVu: 'QuanLy', trangThai: 'DangLam', pinHash: s.hash, pinSalt: s.salt, doiPinLanDau: 'TRUE'
    });
  } else {
    taoNhanVien_({
      maNV: 'QL001', hoTen: 'Quản lý', soDienThoai: '', chucVu: 'QuanLy',
      luongTheoGio: 0, phuCapCa: 0, ngayVaoLam: today_(), ghiChu: 'Khôi phục'
    }, '1234');
  }
  ui.alert('Tài khoản QL001 đã sẵn sàng. PIN: 1234');
}
