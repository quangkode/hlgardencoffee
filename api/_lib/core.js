/*******************************************************
 * core.js — Lớp lõi: tiện ích, kết nối Google Sheets, ảnh chụp dữ liệu
 *
 * Ý tưởng chính:
 *   Gọi Sheets API qua HTTP thì mỗi lần đọc là một vòng mạng. Nếu để code
 *   nghiệp vụ tự đọc lúc nào nó cần thì một thao tác có thể tốn 8 vòng.
 *   Nên: nạp trước toàn bộ sheet cần dùng trong ĐÚNG MỘT lần gọi, chạy
 *   nghiệp vụ đồng bộ trên bản sao trong bộ nhớ, gom mọi thay đổi lại rồi
 *   ghi ngược một lượt. Nhờ vậy code nghiệp vụ giữ nguyên như bản Apps Script.
 *******************************************************/

import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

export const TZ = 'Asia/Ho_Chi_Minh';
const TZ_OFFSET_PHUT = 7 * 60;

/* ================= Tên sheet & cấu trúc cột ================= */

export const SHEETS = {
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

export const HEADERS = {
  [SHEETS.NHANVIEN]: [
    'maNV', 'hoTen', 'soDienThoai', 'chucVu', 'luongTheoGio', 'phuCapCa',
    'ngayVaoLam', 'trangThai', 'pinHash', 'pinSalt', 'doiPinLanDau', 'ghiChu'
  ],
  [SHEETS.CA]: [
    'maCa', 'tenCa', 'gioBatDau', 'gioKetThuc', 'soPhutNghi', 'trangThai', 'ghiChu'
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
    'luongCa', 'phuCap', 'thuong', 'phat', 'soLanTre', 'thucNhan',
    'trangThai', 'nguoiChot', 'thoiGianChot'
  ],
  [SHEETS.CAIDAT]: ['key', 'value', 'moTa'],
  [SHEETS.NHATKY]: ['thoiGian', 'maNV', 'hoTen', 'hanhDong', 'chiTiet']
};

export const TEN_SHEET = Object.values(SHEETS);

/* ================= Chuẩn hoá giá trị ================= */

export function pad2_(n) { return ('0' + n).slice(-2); }

export function dstr_(v) {
  if (v instanceof Date) return dinhDangNgay_(v, 'yyyy-MM-dd');
  return String(v == null ? '' : v).trim();
}
export function tstr_(v) {
  if (v instanceof Date) return dinhDangNgay_(v, 'HH:mm');
  const s = String(v == null ? '' : v).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  return m ? pad2_(m[1]) + ':' + m[2] : s;
}
export function num_(v) {
  if (typeof v === 'number') return v;
  const s = String(v == null ? '' : v).replace(/[^\d.\-]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
export function bool_(v) {
  if (v === true) return true;
  const s = String(v == null ? '' : v).trim().toUpperCase();
  return s === 'TRUE' || s === '1' || s === 'CO' || s === 'CÓ' || s === 'X';
}

/* ================= Thời gian (luôn theo giờ Việt Nam) ================= */

function phanTuNgay_(d) {
  const t = new Date(d.getTime() + TZ_OFFSET_PHUT * 60000);
  return {
    y: t.getUTCFullYear(), M: t.getUTCMonth() + 1, d: t.getUTCDate(),
    H: t.getUTCHours(), m: t.getUTCMinutes(), s: t.getUTCSeconds()
  };
}

/** Thay cho Utilities.formatDate của Apps Script. */
export function dinhDangNgay_(d, fmt) {
  const p = phanTuNgay_(d);
  return fmt
    .replace(/yyyy/g, String(p.y).padStart(4, '0'))
    .replace(/yy/g, pad2_(p.y % 100))
    .replace(/MM/g, pad2_(p.M))
    .replace(/dd/g, pad2_(p.d))
    .replace(/HH/g, pad2_(p.H))
    .replace(/mm/g, pad2_(p.m))
    .replace(/ss/g, pad2_(p.s));
}

export function now_() { return new Date(); }
export function today_() { return dinhDangNgay_(now_(), 'yyyy-MM-dd'); }
export function nowTime_() { return dinhDangNgay_(now_(), 'HH:mm'); }
export function nowStamp_() { return dinhDangNgay_(now_(), 'yyyy-MM-dd HH:mm:ss'); }
export function thangHienTai_() { return dinhDangNgay_(now_(), 'yyyy-MM'); }
export function ngayLech_(soNgay) {
  return dinhDangNgay_(new Date(Date.now() + soNgay * 86400000), 'yyyy-MM-dd');
}

export function phutTuChuoi_(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return -1;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}
export function chuoiTuPhut_(p) {
  p = ((Math.round(p) % 1440) + 1440) % 1440;
  return pad2_(Math.floor(p / 60)) + ':' + pad2_(p % 60);
}

export function uid_(prefix) {
  return (prefix || '') + dinhDangNgay_(now_(), 'yyMMddHHmmss') +
         Math.floor(Math.random() * 900 + 100);
}

export function trongKhoang_(ngay, tu, den) {
  const n = dstr_(ngay);
  if (tu && n < tu) return false;
  if (den && n > den) return false;
  return true;
}

export function khoangThang_(thang) {
  const t = String(thang || thangHienTai_()).slice(0, 7);
  const y = parseInt(t.slice(0, 4), 10), m = parseInt(t.slice(5, 7), 10);
  const cuoi = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { thang: t, tu: t + '-01', den: t + '-' + pad2_(cuoi) };
}

/** Khoảng cách Haversine, đơn vị mét. */
export function khoangCach_(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/* ================= Cấu hình môi trường ================= */

export function env_(ten, batBuoc) {
  const v = process.env[ten];
  if (!v && batBuoc) {
    throw new Error(
      'Thiếu biến môi trường ' + ten + '. Vào Vercel → Settings → ' +
      'Environment Variables để thêm, rồi Redeploy. Xem HUONG-DAN-VERCEL.md.'
    );
  }
  return v || '';
}

/* ================= Xác thực Google (JWT tự ký, không cần thư viện) ================= */

let _token = null;   // { value, hetHan }

function b64url_(buf) {
  return Buffer.from(buf).toString('base64url');
}

async function layAccessToken_() {
  if (_token && _token.hetHan > Date.now() + 60000) return _token.value;

  const email = env_('GOOGLE_SERVICE_ACCOUNT_EMAIL', true);
  // Khoá riêng dán vào Vercel thường bị escape xuống dòng thành \n literal
  const key = env_('GOOGLE_PRIVATE_KEY', true).replace(/\\n/g, '\n');

  const now = Math.floor(Date.now() / 1000);
  const header = b64url_(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url_(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  const kySo = crypto.createSign('RSA-SHA256')
    .update(header + '.' + claim)
    .sign(key);
  const jwt = header + '.' + claim + '.' + b64url_(kySo);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(
      'Không lấy được quyền truy cập Google Sheets: ' +
      (data.error_description || data.error || res.status) +
      '. Kiểm tra GOOGLE_SERVICE_ACCOUNT_EMAIL và GOOGLE_PRIVATE_KEY.'
    );
  }
  _token = { value: data.access_token, hetHan: Date.now() + (data.expires_in || 3600) * 1000 };
  return _token.value;
}

/* ================= Gọi Sheets API ================= */

function sheetId_() { return env_('GOOGLE_SHEET_ID', true); }

async function goiSheets_(duongDan, tuyChon = {}) {
  const token = await layAccessToken_();
  const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + sheetId_() + duongDan;
  const res = await fetch(url, {
    ...tuyChon,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...(tuyChon.headers || {})
    }
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* để nguyên */ }

  if (!res.ok) {
    const msg = data?.error?.message || text || String(res.status);
    if (res.status === 403) {
      throw new Error(
        'Service account chưa có quyền vào file Sheets. Mở file Sheets → Chia sẻ → ' +
        'thêm email service account làm Người chỉnh sửa. (' + msg + ')'
      );
    }
    if (res.status === 404) {
      throw new Error('Không tìm thấy file Sheets. Kiểm tra lại GOOGLE_SHEET_ID. (' + msg + ')');
    }
    throw new Error('Lỗi Google Sheets: ' + msg);
  }
  return data;
}

/* ================= Thông tin sheet (id số, dùng để xoá dòng) ================= */

let _metaCache = null;

export async function docMeta_({ lamMoi = false } = {}) {
  if (_metaCache && !lamMoi) return _metaCache;
  const data = await goiSheets_('?fields=sheets.properties(sheetId,title)');
  const map = {};
  (data.sheets || []).forEach(s => { map[s.properties.title] = s.properties.sheetId; });
  _metaCache = map;
  return map;
}

export function xoaCacheMeta_() { _metaCache = null; }

/** Tạo các sheet còn thiếu kèm dòng tiêu đề. Trả về danh sách sheet vừa tạo. */
export async function taoSheetConThieu_() {
  const meta = await docMeta_({ lamMoi: true });
  const thieu = TEN_SHEET.filter(t => meta[t] === undefined);
  if (!thieu.length) return [];

  await goiSheets_(':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({
      requests: thieu.map(t => ({
        addSheet: { properties: { title: t, gridProperties: { frozenRowCount: 1 } } }
      }))
    })
  });

  await goiSheets_('/values:batchUpdate', {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: thieu.map(t => ({ range: `${t}!A1`, values: [HEADERS[t]] }))
    })
  });

  xoaCacheMeta_();
  await docMeta_({ lamMoi: true });
  return thieu;
}

/* ================= Ảnh chụp dữ liệu + hàng đợi ghi ================= */

function phanTichBang_(ten, values) {
  const head = HEADERS[ten];
  const rows = [];
  for (let i = 1; i < (values || []).length; i++) {
    const row = values[i] || [];
    if (!row.some(c => c !== '' && c !== null && c !== undefined)) continue;
    const o = { _row: i + 1 };
    head.forEach((h, j) => { o[h] = row[j] === undefined ? '' : row[j]; });
    rows.push(o);
  }
  return rows;
}

function coA1_(n) {                       // 1 -> A, 27 -> AA
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - 1 - r) / 26; }
  return s;
}

class Db {
  constructor(bang) {
    this.bang = bang;              // { tenSheet: [rows] }
    this.soDong = {};              // số dòng cuối cùng đang có trên sheet
    this.capNhat = [];             // { range, values }
    this.themMoi = {};             // { tenSheet: [ [ô,...] ] }
    this.xoaDong = [];             // { ten, row }
    Object.keys(bang).forEach(t => {
      const cuoi = bang[t].reduce((m, r) => Math.max(m, r._row), 1);
      this.soDong[t] = cuoi;
    });
  }

  _kiemTra(ten) {
    if (!this.bang[ten]) {
      throw new Error('Sheet "' + ten + '" chưa được nạp cho thao tác này (lỗi lập trình).');
    }
  }

  readAll(ten) { this._kiemTra(ten); return this.bang[ten]; }

  append(ten, obj) {
    this._kiemTra(ten);
    const head = HEADERS[ten];
    const hang = head.map(h => (obj[h] === undefined || obj[h] === null) ? '' : obj[h]);
    (this.themMoi[ten] = this.themMoi[ten] || []).push(hang);
    this.soDong[ten] += 1;
    this.bang[ten].push({ ...obj, _row: this.soDong[ten] });
    return obj;
  }

  appendMany(ten, ds) {
    (ds || []).forEach(o => this.append(ten, o));
    return (ds || []).length;
  }

  patch(ten, row, phan) {
    this._kiemTra(ten);
    const head = HEADERS[ten];
    Object.keys(phan).forEach(k => {
      const c = head.indexOf(k);
      if (c < 0) return;
      const v = phan[k] === undefined || phan[k] === null ? '' : phan[k];
      this.capNhat.push({ range: `${ten}!${coA1_(c + 1)}${row}`, values: [[v]] });
    });
    const doiTuong = this.bang[ten].find(r => r._row === row);
    if (doiTuong) Object.assign(doiTuong, phan);
  }

  writeRow(ten, row, obj) {
    this._kiemTra(ten);
    const head = HEADERS[ten];
    const hang = head.map(h => (obj[h] === undefined || obj[h] === null) ? '' : obj[h]);
    this.capNhat.push({ range: `${ten}!A${row}:${coA1_(head.length)}${row}`, values: [hang] });
    const i = this.bang[ten].findIndex(r => r._row === row);
    if (i >= 0) this.bang[ten][i] = { ...obj, _row: row };
  }

  remove(ten, row) {
    this._kiemTra(ten);
    this.xoaDong.push({ ten, row });
    this.bang[ten] = this.bang[ten].filter(r => r._row !== row);
  }

  coThayDoi() {
    return this.capNhat.length > 0 || this.xoaDong.length > 0 ||
           Object.keys(this.themMoi).length > 0;
  }

  /** Ghi mọi thay đổi lên Google Sheets. Thứ tự: sửa ô → thêm dòng → xoá dòng. */
  async flush() {
    if (this.capNhat.length) {
      await goiSheets_('/values:batchUpdate', {
        method: 'POST',
        body: JSON.stringify({ valueInputOption: 'RAW', data: this.capNhat })
      });
      this.capNhat = [];
    }

    for (const ten of Object.keys(this.themMoi)) {
      const rows = this.themMoi[ten];
      if (!rows.length) continue;
      await goiSheets_(
        `/values/${encodeURIComponent(ten)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        { method: 'POST', body: JSON.stringify({ values: rows }) }
      );
    }
    this.themMoi = {};

    if (this.xoaDong.length) {
      const meta = await docMeta_();
      // Xoá từ dưới lên để chỉ số dòng phía trên không bị xê dịch
      const yeuCau = this.xoaDong
        .slice()
        .sort((a, b) => b.row - a.row)
        .map(x => ({
          deleteDimension: {
            range: {
              sheetId: meta[x.ten],
              dimension: 'ROWS',
              startIndex: x.row - 1,
              endIndex: x.row
            }
          }
        }));
      await goiSheets_(':batchUpdate', {
        method: 'POST',
        body: JSON.stringify({ requests: yeuCau })
      });
      this.xoaDong = [];
    }
  }
}

/** Nạp các sheet cần dùng trong đúng một lần gọi mạng. */
export async function napDb_(danhSachSheet) {
  const ten = [...new Set(danhSachSheet)].filter(t => HEADERS[t]);
  if (!ten.length) return new Db({});

  const qs = ten.map(t => 'ranges=' + encodeURIComponent(t)).join('&');
  let data;
  try {
    data = await goiSheets_('/values:batchGet?' + qs + '&majorDimension=ROWS');
  } catch (e) {
    // Sheet chưa tồn tại (lần chạy đầu) -> tạo rồi thử lại đúng một lần
    if (!/Unable to parse range|not found/i.test(e.message)) throw e;
    await taoSheetConThieu_();
    data = await goiSheets_('/values:batchGet?' + qs + '&majorDimension=ROWS');
  }

  const bang = {};
  ten.forEach((t, i) => {
    bang[t] = phanTichBang_(t, data.valueRanges?.[i]?.values || []);
  });
  return new Db(bang);
}

/* ================= Ngữ cảnh mỗi lượt gọi ================= */

const als = new AsyncLocalStorage();

export function chayVoiDb_(db, fn) { return als.run({ db, log: [] }, fn); }

function ctx_() {
  const c = als.getStore();
  if (!c) throw new Error('Gọi hàm dữ liệu ngoài phạm vi một request.');
  return c;
}
export function db_() { return ctx_().db; }

/* --- Các hàm giữ đúng tên như bản Apps Script để code nghiệp vụ dùng lại --- */

export function readAll_(ten) { return db_().readAll(ten); }
export function appendObj_(ten, obj) { return db_().append(ten, obj); }
export function appendMany_(ten, ds) { return db_().appendMany(ten, ds); }
export function patchRow_(ten, row, phan) { return db_().patch(ten, row, phan); }
export function writeRow_(ten, row, obj) { return db_().writeRow(ten, row, obj); }
export function deleteRow_(ten, row) { return db_().remove(ten, row); }

export function findBy_(ten, truong, giaTri) {
  const v = String(giaTri).trim().toUpperCase();
  return readAll_(ten).find(r => String(r[truong]).trim().toUpperCase() === v) || null;
}

/* ================= Cài đặt ================= */

export function cfg_() {
  const c = ctx_();
  if (c._cfg) return c._cfg;
  const map = {};
  readAll_(SHEETS.CAIDAT).forEach(r => {
    map[String(r.key).trim()] = String(r.value == null ? '' : r.value).trim();
  });
  c._cfg = map;
  return map;
}
export function getCfg_(key, mac) {
  const v = cfg_()[key];
  return (v === undefined || v === '') ? mac : v;
}
export function getCfgNum_(key, mac) {
  const v = cfg_()[key];
  return (v === undefined || v === '') ? mac : num_(v);
}
export function getCfgBool_(key, mac) {
  const v = cfg_()[key];
  return (v === undefined || v === '') ? mac : bool_(v);
}
export function setCfgNhieu_(map) {
  const rows = readAll_(SHEETS.CAIDAT);
  const viTri = {};
  rows.forEach(r => { viTri[String(r.key).trim()] = r._row; });

  Object.keys(map).forEach(k => {
    const v = String(map[k] == null ? '' : map[k]);
    if (viTri[k]) patchRow_(SHEETS.CAIDAT, viTri[k], { value: v });
    else appendObj_(SHEETS.CAIDAT, { key: k, value: v, moTa: '' });
  });
  delete ctx_()._cfg;
  return Object.keys(map).length;
}
export function setCfg_(key, value) { return setCfgNhieu_({ [key]: value }); }

/* ================= Nhật ký ================= */

export function ghiNhatKy_(user, hanhDong, chiTiet) {
  try {
    appendObj_(SHEETS.NHATKY, {
      thoiGian: nowStamp_(),
      maNV: user ? user.maNV : '',
      hoTen: user ? user.hoTen : '',
      hanhDong,
      chiTiet: typeof chiTiet === 'string' ? chiTiet : JSON.stringify(chiTiet || {})
    });
  } catch { /* không để nhật ký làm hỏng nghiệp vụ */ }
}

/* ================= Phân loại lỗi =================
 * Sai PIN, thiếu ô bắt buộc, trùng ca... là lỗi của người dùng: đã có thông
 * báo tiếng Việt trả về màn hình, không cần ghi log. Chỉ ghi log những lỗi
 * thật sự bất thường, để nhật ký Vercel còn đọc được khi cần dò sự cố.
 */
export function laLoiHeThong_(err) {
  if (!(err instanceof Error)) return true;
  if (err.name !== 'Error') return true;          // TypeError, RangeError, ...
  return /Google Sheets|biến môi trường|quyền truy cập|service account|không đọc được/i
    .test(err.message);
}

/* ================= Bộ nhớ tạm (chống dò PIN) ================= */

const _cache = new Map();

export const boNhoTam = {
  get(k) {
    const v = _cache.get(k);
    if (!v) return null;
    if (v.hetHan < Date.now()) { _cache.delete(k); return null; }
    return v.giaTri;
  },
  put(k, giaTri, giay) {
    _cache.set(k, { giaTri, hetHan: Date.now() + giay * 1000 });
  },
  remove(k) { _cache.delete(k); }
};
