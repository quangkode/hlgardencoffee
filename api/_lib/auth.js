/*******************************************************
 * auth.js — Đăng nhập bằng Mã NV + PIN, phiên ký HMAC
 *
 * PIN không bao giờ lưu dạng thô. Bản Vercel dùng scrypt thay cho SHA-256:
 * PIN chỉ 4–6 chữ số nên nếu file Sheets lọt ra ngoài, SHA-256 dò hết
 * 10.000 khả năng chỉ mất một nháy. scrypt làm mỗi lần thử tốn ~100ms,
 * cộng thêm PIN_PEPPER nằm ngoài bảng tính, dò trở nên bất khả thi.
 *******************************************************/

import crypto from 'node:crypto';
import {
  SHEETS, readAll_, appendObj_, patchRow_, findBy_, bool_, num_, dstr_,
  today_, nowStamp_, getCfg_, getCfgNum_, getCfgBool_, ghiNhatKy_,
  env_, boNhoTam
} from './core.js';

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function pepper_() { return env_('PIN_PEPPER', true); }
function secret_() { return env_('TOKEN_SECRET', true); }

export function bamPin_(pin, salt) {
  return crypto
    .scryptSync(String(pin) + '|' + pepper_(), String(salt), 32, SCRYPT)
    .toString('hex');
}

export function taoHashPin_(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: bamPin_(pin, salt) };
}

function bangNhau_(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

export function kiemTraPinHopLe_(pin) {
  const s = String(pin == null ? '' : pin).trim();
  if (!/^\d{4,10}$/.test(s)) throw new Error('PIN phải là 4–10 chữ số.');
  if (/^(\d)\1+$/.test(s)) throw new Error('PIN không được là các số giống nhau (1111, 0000...).');
  if (['1234', '12345', '123456', '4321', '654321'].includes(s)) {
    throw new Error('PIN quá dễ đoán, chọn dãy số khác.');
  }
  return s;
}

/* ================= Nhân viên ================= */

export function taoNhanVien_(nv, pin) {
  const s = taoHashPin_(pin || '1234');
  const obj = {
    maNV: String(nv.maNV).trim().toUpperCase(),
    hoTen: String(nv.hoTen || '').trim(),
    soDienThoai: String(nv.soDienThoai || '').trim(),
    chucVu: nv.chucVu === 'QuanLy' ? 'QuanLy' : 'NhanVien',
    luongTheoGio: num_(nv.luongTheoGio),
    phuCapCa: num_(nv.phuCapCa),
    ngayVaoLam: dstr_(nv.ngayVaoLam) || today_(),
    trangThai: nv.trangThai || 'DangLam',
    pinHash: s.hash,
    pinSalt: s.salt,
    doiPinLanDau: 'TRUE',
    ghiChu: nv.ghiChu || ''
  };
  appendObj_(SHEETS.NHANVIEN, obj);
  return obj;
}

export function laQuanLy_(nv) { return String(nv.chucVu).trim() === 'QuanLy'; }

export function batBuocQuanLy_(nv) {
  if (!laQuanLy_(nv)) throw new Error('Bạn không có quyền thực hiện thao tác này.');
  return nv;
}

export function hoSoCongKhai_(nv) {
  return {
    maNV: nv.maNV,
    hoTen: nv.hoTen,
    chucVu: String(nv.chucVu).trim(),
    soDienThoai: String(nv.soDienThoai || ''),
    luongTheoGio: num_(nv.luongTheoGio) || getCfgNum_('luongGioMacDinh', 25000),
    phuCapCa: num_(nv.phuCapCa) || getCfgNum_('phuCapCaMacDinh', 0),
    ngayVaoLam: dstr_(nv.ngayVaoLam),
    doiPinLanDau: bool_(nv.doiPinLanDau)
  };
}

/* ================= Token phiên ================= */

function ky_(payload) {
  return crypto.createHmac('sha256', secret_()).update(payload).digest('hex');
}

export function taoToken_(nv) {
  const phut = getCfgNum_('thoiGianPhienDangNhap', 720);
  const exp = Date.now() + phut * 60000;
  const payload = [nv.maNV, exp, String(nv.pinHash).slice(0, 12)].join('|');
  return Buffer.from(payload).toString('base64url') + '.' + ky_(payload);
}

export function xacThuc_(token) {
  if (!token) throw new Error('AUTH: Chưa đăng nhập.');
  const phan = String(token).split('.');
  if (phan.length !== 2) throw new Error('AUTH: Phiên không hợp lệ.');

  let payload;
  try { payload = Buffer.from(phan[0], 'base64url').toString('utf8'); }
  catch { throw new Error('AUTH: Phiên không hợp lệ.'); }
  if (!bangNhau_(ky_(payload), phan[1])) throw new Error('AUTH: Phiên không hợp lệ.');

  const [maNV, expStr, hashPrefix] = payload.split('|');
  if (!(Number(expStr) > Date.now())) throw new Error('AUTH: Phiên đã hết hạn, đăng nhập lại.');

  const nv = findBy_(SHEETS.NHANVIEN, 'maNV', maNV);
  if (!nv) throw new Error('AUTH: Tài khoản không tồn tại.');
  if (String(nv.trangThai).trim() !== 'DangLam') throw new Error('AUTH: Tài khoản đã bị khoá.');
  if (String(nv.pinHash).slice(0, 12) !== hashPrefix) throw new Error('AUTH: PIN đã đổi, đăng nhập lại.');

  return nv;
}

/** Đọc mã NV trong token mà chưa cần chạm vào bảng tính — để biết nạp sheet nào. */
export function maNVTrongToken_(token) {
  try {
    const payload = Buffer.from(String(token).split('.')[0], 'base64url').toString('utf8');
    return payload.split('|')[0] || '';
  } catch { return ''; }
}

/* ================= Đăng nhập ================= */

export function login_(p) {
  const maNV = String(p.maNV || '').trim().toUpperCase();
  const pin = String(p.pin || '').trim();
  if (!maNV || !pin) throw new Error('Nhập đủ mã nhân viên và PIN.');

  const khoa = 'fail_' + maNV;
  const soLan = Number(boNhoTam.get(khoa) || 0);
  if (soLan >= 5) {
    throw new Error('Sai PIN quá 5 lần. Chờ 10 phút hoặc nhờ quản lý reset PIN.');
  }

  const nv = findBy_(SHEETS.NHANVIEN, 'maNV', maNV);
  const dung = nv && bangNhau_(bamPin_(pin, String(nv.pinSalt)), String(nv.pinHash));
  if (!dung) {
    boNhoTam.put(khoa, String(soLan + 1), 600);
    throw new Error('Mã nhân viên hoặc PIN không đúng. (' + (4 - soLan) + ' lần thử còn lại)');
  }
  if (String(nv.trangThai).trim() !== 'DangLam') {
    throw new Error('Tài khoản đã nghỉ việc / bị khoá.');
  }

  boNhoTam.remove(khoa);
  ghiNhatKy_(nv, 'DangNhap', '');

  return { token: taoToken_(nv), me: hoSoCongKhai_(nv), cauHinh: cauHinhChoClient_() };
}

export function doiPin_(nv, p) {
  const cu = String(p.pinCu || '').trim();
  const moi = kiemTraPinHopLe_(p.pinMoi);
  if (String(p.pinMoi) !== String(p.pinMoiNhapLai)) {
    throw new Error('Hai lần nhập PIN mới không khớp.');
  }
  if (!bangNhau_(bamPin_(cu, String(nv.pinSalt)), String(nv.pinHash))) {
    throw new Error('PIN hiện tại không đúng.');
  }
  if (cu === moi) throw new Error('PIN mới phải khác PIN cũ.');

  const s = taoHashPin_(moi);
  patchRow_(SHEETS.NHANVIEN, nv._row, { pinHash: s.hash, pinSalt: s.salt, doiPinLanDau: 'FALSE' });
  ghiNhatKy_(nv, 'DoiPin', '');

  const nvMoi = findBy_(SHEETS.NHANVIEN, 'maNV', nv.maNV);
  return { token: taoToken_(nvMoi), me: hoSoCongKhai_(nvMoi) };
}

/* ================= Cấu hình gửi xuống trình duyệt ================= */

export function cauHinhChoClient_() {
  return {
    tenQuan: getCfg_('tenQuan', 'Quán Cà Phê'),
    diaChiQuan: getCfg_('diaChiQuan', ''),
    banKinhChamCong: getCfgNum_('banKinhChamCong', 0),
    batBuocViTri: getCfgBool_('batBuocViTri', true),
    yeuCauAnh: false,
    choPhepTuDangKyCa: getCfgBool_('choPhepTuDangKyCa', true),
    hanBaoCaTruoc: getCfgNum_('hanBaoCaTruoc', 1),
    batBuocKiemKhoCuoiCa: getCfgBool_('batBuocKiemKhoCuoiCa', false),
    phutTreChoPhep: getCfgNum_('phutTreChoPhep', 5),
    serverTime: nowStamp_(),
    homNay: today_()
  };
}
