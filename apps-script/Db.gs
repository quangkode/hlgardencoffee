/*******************************************************
 * Db.gs — Lớp truy cập Google Sheets
 * Mọi dữ liệu của app đều nằm trong 1 file Google Sheets.
 *******************************************************/

const TZ = 'Asia/Ho_Chi_Minh';

const SHEETS = {
  NHANVIEN:   'NhanVien',
  CA:         'CaLamViec',
  LICH:       'LichLamViec',
  CHAMCONG:   'ChamCong',
  HANG:       'DanhMucHang',
  KIEMKHO:    'KiemKho',
  GIAOCA:     'GiaoCa',
  THUONGPHAT: 'ThuongPhat',
  BANGLUONG:  'BangLuong',
  CAIDAT:     'CaiDat',
  NHATKY:     'NhatKy'
};

/** Cột của từng sheet. Thứ tự này là thứ tự cột thật trên Sheets. */
const HEADERS = {
  [SHEETS.NHANVIEN]: [
    'maNV', 'hoTen', 'soDienThoai', 'chucVu', 'luongTheoGio', 'phuCapCa',
    'ngayVaoLam', 'trangThai', 'pinHash', 'pinSalt', 'doiPinLanDau', 'ghiChu'
  ],
  [SHEETS.CA]: [
    'maCa', 'tenCa', 'gioBatDau', 'gioKetThuc', 'soPhutNghi', 'heSoLuong', 'trangThai', 'ghiChu'
  ],
  [SHEETS.LICH]: [
    'id', 'maNV', 'hoTen', 'ngay', 'maCa', 'trangThai', 'ghiChuNV', 'ghiChuQL',
    'nguoiTao', 'thoiGianTao', 'nguoiDuyet', 'thoiGianDuyet'
  ],
  [SHEETS.CHAMCONG]: [
    'id', 'maNV', 'hoTen', 'ngay', 'maCa', 'gioVao', 'gioRa',
    'soPhutLam', 'soPhutTre', 'soPhutVeSom', 'trangThai',
    'viTriVao', 'khoangCachVao', 'viTriRa', 'khoangCachRa', 'ngoaiVung', 'ngoaiLich',
    'anhVao', 'anhRa', 'ghiChu', 'nguoiSua', 'thoiGianSua'
  ],
  [SHEETS.HANG]: [
    'maHang', 'tenHang', 'donVi', 'nhomHang', 'tonDinhMuc', 'giaVon', 'trangThai'
  ],
  [SHEETS.KIEMKHO]: [
    'id', 'thoiGian', 'ngay', 'maCa', 'maNV', 'hoTen', 'maHang', 'tenHang', 'donVi',
    'tonTruoc', 'nhapThem', 'thucTe', 'haoHut', 'duoiDinhMuc', 'ghiChu'
  ],
  [SHEETS.GIAOCA]: [
    'id', 'thoiGian', 'ngay', 'maCa', 'maNVGiao', 'tenNVGiao', 'maNVNhan', 'tenNVNhan',
    'tienDauCa', 'tienMatCuoiCa', 'tienChuyenKhoan', 'tongDoanhThu', 'soHoaDon',
    'tienNopVe', 'chenhLech', 'tinhTrangThietBi', 'vanDe', 'ghiChu',
    'trangThai', 'thoiGianXacNhan'
  ],
  [SHEETS.THUONGPHAT]: [
    'id', 'thang', 'maNV', 'hoTen', 'loai', 'soTien', 'lyDo', 'nguoiTao', 'thoiGian'
  ],
  [SHEETS.BANGLUONG]: [
    'id', 'thang', 'maNV', 'hoTen', 'soCa', 'tongPhutLam', 'tongGio', 'luongTheoGio',
    'luongCa', 'phuCap', 'thuong', 'phat', 'phatTre', 'thucNhan',
    'trangThai', 'nguoiChot', 'thoiGianChot'
  ],
  [SHEETS.CAIDAT]: ['key', 'value', 'moTa'],
  [SHEETS.NHATKY]: ['thoiGian', 'maNV', 'hoTen', 'hanhDong', 'chiTiet']
};

/** Cột phải ép định dạng TEXT để Sheets không tự đổi thành date/number. */
const TEXT_COLS = {
  [SHEETS.NHANVIEN]: ['maNV', 'soDienThoai', 'ngayVaoLam', 'pinHash', 'pinSalt'],
  [SHEETS.CA]:       ['maCa', 'gioBatDau', 'gioKetThuc'],
  [SHEETS.LICH]:     ['id', 'maNV', 'ngay', 'maCa', 'thoiGianTao', 'thoiGianDuyet'],
  [SHEETS.CHAMCONG]: ['id', 'maNV', 'ngay', 'maCa', 'gioVao', 'gioRa', 'viTriVao', 'viTriRa', 'thoiGianSua'],
  [SHEETS.HANG]:     ['maHang'],
  [SHEETS.KIEMKHO]:  ['id', 'thoiGian', 'ngay', 'maCa', 'maNV', 'maHang'],
  [SHEETS.GIAOCA]:   ['id', 'thoiGian', 'ngay', 'maCa', 'maNVGiao', 'maNVNhan', 'thoiGianXacNhan'],
  [SHEETS.THUONGPHAT]: ['id', 'thang', 'maNV', 'thoiGian'],
  [SHEETS.BANGLUONG]:  ['id', 'thang', 'maNV', 'thoiGianChot'],
  [SHEETS.CAIDAT]:     ['key', 'value'],
  [SHEETS.NHATKY]:     ['thoiGian', 'maNV']
};

let _ss = null;
const _shCache = {};

/** Lấy Spreadsheet: ưu tiên file gắn với script, nếu không thì lấy theo SPREADSHEET_ID. */
function ss_() {
  if (_ss) return _ss;
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) {
    _ss = SpreadsheetApp.openById(id);
  } else {
    _ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!_ss) throw new Error('Chưa cấu hình SPREADSHEET_ID. Chạy hàm khoiTaoHeThong() một lần.');
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', _ss.getId());
  }
  return _ss;
}

function sheet_(name) {
  if (_shCache[name]) return _shCache[name];
  let sh = ss_().getSheetByName(name);
  if (!sh) sh = taoSheet_(name);
  _shCache[name] = sh;
  return sh;
}

function taoSheet_(name) {
  const head = HEADERS[name];
  if (!head) throw new Error('Không biết cấu trúc sheet: ' + name);
  const sh = ss_().insertSheet(name);
  sh.getRange(1, 1, 1, head.length).setValues([head])
    .setFontWeight('bold').setBackground('#3f2a1d').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  // ép text cho các cột nhạy cảm
  (TEXT_COLS[name] || []).forEach(col => {
    const idx = head.indexOf(col);
    if (idx >= 0) sh.getRange(2, idx + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
  });
  sh.autoResizeColumns(1, head.length);
  return sh;
}

/* ---------- Chuẩn hoá giá trị ---------- */

/** Chuỗi ngày yyyy-MM-dd (chấp nhận cả khi ô đang là Date). */
function dstr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return String(v == null ? '' : v).trim();
}
/** Chuỗi giờ HH:mm (chấp nhận cả khi ô đang là Date/number). */
function tstr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'HH:mm');
  const s = String(v == null ? '' : v).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  return m ? pad2_(m[1]) + ':' + m[2] : s;
}
function num_(v) {
  if (typeof v === 'number') return v;
  const s = String(v == null ? '' : v).replace(/[^\d.\-]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function bool_(v) {
  const s = String(v == null ? '' : v).trim().toUpperCase();
  return s === 'TRUE' || s === '1' || s === 'CO' || s === 'CÓ' || s === 'X' || v === true;
}
function pad2_(n) { return ('0' + n).slice(-2); }

/* ---------- Đọc / ghi ---------- */

function headers_(name) { return HEADERS[name].slice(); }

/** Đọc toàn bộ sheet thành mảng object, kèm _row (số dòng thật trên sheet). */
function readAll_(name) {
  const sh = sheet_(name);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const head = HEADERS[name];
  const values = sh.getRange(2, 1, last - 1, head.length).getValues();
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    let empty = true;
    for (let j = 0; j < row.length; j++) { if (row[j] !== '' && row[j] !== null) { empty = false; break; } }
    if (empty) continue;
    const o = { _row: i + 2 };
    for (let j = 0; j < head.length; j++) o[head[j]] = row[j];
    out.push(o);
  }
  return out;
}

/** Ghi thêm 1 dòng từ object. */
function appendObj_(name, obj) {
  const head = HEADERS[name];
  const row = head.map(h => (obj[h] === undefined || obj[h] === null) ? '' : obj[h]);
  sheet_(name).appendRow(row);
  return obj;
}

/** Ghi thêm nhiều dòng cùng lúc (nhanh hơn nhiều so với appendRow từng dòng). */
function appendMany_(name, objs) {
  if (!objs || !objs.length) return 0;
  const head = HEADERS[name];
  const sh = sheet_(name);
  const rows = objs.map(o => head.map(h => (o[h] === undefined || o[h] === null) ? '' : o[h]));
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, head.length).setValues(rows);
  return rows.length;
}

/** Cập nhật một số cột của dòng _row. */
function patchRow_(name, rowIndex, patch) {
  const head = HEADERS[name];
  const sh = sheet_(name);
  Object.keys(patch).forEach(k => {
    const c = head.indexOf(k);
    if (c >= 0) sh.getRange(rowIndex, c + 1).setValue(patch[k]);
  });
}

/** Ghi đè toàn bộ 1 dòng từ object. */
function writeRow_(name, rowIndex, obj) {
  const head = HEADERS[name];
  const row = head.map(h => (obj[h] === undefined || obj[h] === null) ? '' : obj[h]);
  sheet_(name).getRange(rowIndex, 1, 1, head.length).setValues([row]);
}

function deleteRow_(name, rowIndex) { sheet_(name).deleteRow(rowIndex); }

function findBy_(name, field, value) {
  const rows = readAll_(name);
  const v = String(value).trim().toUpperCase();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][field]).trim().toUpperCase() === v) return rows[i];
  }
  return null;
}

/* ---------- Cài đặt ---------- */

let _cfgCache = null;
function cfg_() {
  if (_cfgCache) return _cfgCache;
  const map = {};
  readAll_(SHEETS.CAIDAT).forEach(r => { map[String(r.key).trim()] = String(r.value == null ? '' : r.value).trim(); });
  _cfgCache = map;
  return map;
}
function getCfg_(key, def) {
  const v = cfg_()[key];
  return (v === undefined || v === '') ? def : v;
}
function getCfgNum_(key, def) {
  const v = cfg_()[key];
  return (v === undefined || v === '') ? def : num_(v);
}
function getCfgBool_(key, def) {
  const v = cfg_()[key];
  return (v === undefined || v === '') ? def : bool_(v);
}
function setCfg_(key, value) { setCfgNhieu_({ [key]: value }); }

/** Ghi nhiều cài đặt trong một lượt đọc sheet. */
function setCfgNhieu_(map) {
  const rows = readAll_(SHEETS.CAIDAT);
  const viTri = {};
  rows.forEach(r => { viTri[String(r.key).trim()] = r._row; });

  const them = [];
  Object.keys(map).forEach(k => {
    const v = String(map[k] == null ? '' : map[k]);
    if (viTri[k]) sheet_(SHEETS.CAIDAT).getRange(viTri[k], 2).setValue(v);
    else them.push({ key: k, value: v, moTa: '' });
  });
  appendMany_(SHEETS.CAIDAT, them);
  _cfgCache = null;
  return Object.keys(map).length;
}

/* ---------- Thời gian ---------- */

function now_() { return new Date(); }
function today_() { return Utilities.formatDate(now_(), TZ, 'yyyy-MM-dd'); }
function nowTime_() { return Utilities.formatDate(now_(), TZ, 'HH:mm'); }
function nowStamp_() { return Utilities.formatDate(now_(), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function thangHienTai_() { return Utilities.formatDate(now_(), TZ, 'yyyy-MM'); }

/** 'HH:mm' -> số phút từ 00:00. Trả -1 nếu không hợp lệ. */
function phutTuChuoi_(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return -1;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}
function chuoiTuPhut_(p) {
  p = ((Math.round(p) % 1440) + 1440) % 1440;
  return pad2_(Math.floor(p / 60)) + ':' + pad2_(p % 60);
}

function uid_(prefix) {
  return (prefix || '') + Utilities.formatDate(now_(), TZ, 'yyMMddHHmmss') +
         Math.floor(Math.random() * 900 + 100);
}

/* ---------- Nhật ký ---------- */

function ghiNhatKy_(user, hanhDong, chiTiet) {
  try {
    appendObj_(SHEETS.NHATKY, {
      thoiGian: nowStamp_(),
      maNV: user ? user.maNV : '',
      hoTen: user ? user.hoTen : '',
      hanhDong: hanhDong,
      chiTiet: typeof chiTiet === 'string' ? chiTiet : JSON.stringify(chiTiet || {})
    });
  } catch (e) { /* không để log làm hỏng nghiệp vụ */ }
}

/* ---------- Khoá đồng thời ---------- */

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('Hệ thống đang bận, thử lại sau vài giây.');
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---------- Khoảng cách GPS (Haversine, mét) ---------- */

function khoangCach_(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
