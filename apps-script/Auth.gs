/*******************************************************
 * Auth.gs — Đăng nhập bằng Mã NV + PIN, phiên ký HMAC
 *
 * PIN không bao giờ lưu dạng thô: lưu SHA-256(salt + pin + pepper).
 * Token phiên là chuỗi tự ký (stateless), hết hạn theo cài đặt.
 * Đổi PIN => token cũ tự động vô hiệu (vì token gắn với 8 ký tự đầu của hash).
 *******************************************************/

function _pepper_() {
  const p = PropertiesService.getScriptProperties();
  let v = p.getProperty('PIN_PEPPER');
  if (!v) { v = Utilities.getUuid(); p.setProperty('PIN_PEPPER', v); }
  return v;
}
function _secret_() {
  const p = PropertiesService.getScriptProperties();
  let v = p.getProperty('TOKEN_SECRET');
  if (!v) { v = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('TOKEN_SECRET', v); }
  return v;
}

function _hex_(bytes) {
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function bamPin_(pin, salt) {
  const raw = salt + '|' + String(pin) + '|' + _pepper_();
  return _hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8));
}

function taoHashPin_(pin) {
  const salt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  return { salt: salt, hash: bamPin_(pin, salt) };
}

function kiemTraPinHopLe_(pin) {
  const s = String(pin == null ? '' : pin).trim();
  if (!/^\d{4,10}$/.test(s)) throw new Error('PIN phải là 4–10 chữ số.');
  if (/^(\d)\1+$/.test(s)) throw new Error('PIN không được là các số giống nhau (1111, 0000...).');
  if (s === '1234' || s === '123456' || s === '12345') {
    // cho phép lúc khởi tạo, nhưng chặn khi người dùng tự đặt
    throw new Error('PIN quá dễ đoán, chọn dãy số khác.');
  }
  return s;
}

/** Tạo nhân viên mới (dùng ở Setup và ở màn hình quản lý). */
function taoNhanVien_(nv, pin) {
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

/* ---------------- Token ---------------- */

function _b64u_(s) {
  return Utilities.base64EncodeWebSafe(s).replace(/=+$/, '');
}
function _unb64u_(s) {
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(s)).getDataAsString();
}
function _ky_(payload) {
  return _hex_(Utilities.computeHmacSha256Signature(payload, _secret_()));
}

function taoToken_(nv) {
  const phut = getCfgNum_('thoiGianPhienDangNhap', 720);
  const exp = Date.now() + phut * 60000;
  const payload = [nv.maNV, exp, String(nv.pinHash).slice(0, 12)].join('|');
  return _b64u_(payload) + '.' + _ky_(payload);
}

/** Xác thực token -> trả về object nhân viên, hoặc ném lỗi. */
function xacThuc_(token) {
  if (!token) throw new Error('AUTH: Chưa đăng nhập.');
  const parts = String(token).split('.');
  if (parts.length !== 2) throw new Error('AUTH: Phiên không hợp lệ.');
  let payload;
  try { payload = _unb64u_(parts[0]); } catch (e) { throw new Error('AUTH: Phiên không hợp lệ.'); }
  if (_ky_(payload) !== parts[1]) throw new Error('AUTH: Phiên không hợp lệ.');

  const f = payload.split('|');
  const maNV = f[0], exp = Number(f[1]), hashPrefix = f[2];
  if (!(exp > Date.now())) throw new Error('AUTH: Phiên đã hết hạn, đăng nhập lại.');

  const nv = findBy_(SHEETS.NHANVIEN, 'maNV', maNV);
  if (!nv) throw new Error('AUTH: Tài khoản không tồn tại.');
  if (String(nv.trangThai).trim() !== 'DangLam') throw new Error('AUTH: Tài khoản đã bị khoá.');
  if (String(nv.pinHash).slice(0, 12) !== hashPrefix) throw new Error('AUTH: PIN đã đổi, đăng nhập lại.');

  return nv;
}

function laQuanLy_(nv) { return String(nv.chucVu).trim() === 'QuanLy'; }

function batBuocQuanLy_(nv) {
  if (!laQuanLy_(nv)) throw new Error('Bạn không có quyền thực hiện thao tác này.');
  return nv;
}

function hoSoCongKhai_(nv) {
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

/* ---------------- Chống dò PIN ---------------- */

function _khoaDangNhap_(maNV) {
  const cache = CacheService.getScriptCache();
  const key = 'fail_' + maNV;
  const n = Number(cache.get(key) || 0);
  return { key: key, cache: cache, soLan: n };
}

function login_(p) {
  const maNV = String(p.maNV || '').trim().toUpperCase();
  const pin = String(p.pin || '').trim();
  if (!maNV || !pin) throw new Error('Nhập đủ mã nhân viên và PIN.');

  const k = _khoaDangNhap_(maNV);
  if (k.soLan >= 5) throw new Error('Sai PIN quá 5 lần. Chờ 10 phút hoặc nhờ quản lý reset PIN.');

  const nv = findBy_(SHEETS.NHANVIEN, 'maNV', maNV);
  if (!nv || bamPin_(pin, String(nv.pinSalt)) !== String(nv.pinHash)) {
    k.cache.put(k.key, String(k.soLan + 1), 600);
    throw new Error('Mã nhân viên hoặc PIN không đúng. (' + (4 - k.soLan) + ' lần thử còn lại)');
  }
  if (String(nv.trangThai).trim() !== 'DangLam') throw new Error('Tài khoản đã nghỉ việc / bị khoá.');

  k.cache.remove(k.key);
  ghiNhatKy_(nv, 'DangNhap', '');

  return {
    token: taoToken_(nv),
    me: hoSoCongKhai_(nv),
    cauHinh: cauHinhChoClient_()
  };
}

function doiPin_(nv, p) {
  const cu = String(p.pinCu || '').trim();
  const moi = kiemTraPinHopLe_(p.pinMoi);
  if (String(p.pinMoi) !== String(p.pinMoiNhapLai)) throw new Error('Hai lần nhập PIN mới không khớp.');
  if (bamPin_(cu, String(nv.pinSalt)) !== String(nv.pinHash)) throw new Error('PIN hiện tại không đúng.');
  if (cu === moi) throw new Error('PIN mới phải khác PIN cũ.');

  const s = taoHashPin_(moi);
  patchRow_(SHEETS.NHANVIEN, nv._row, { pinHash: s.hash, pinSalt: s.salt, doiPinLanDau: 'FALSE' });
  ghiNhatKy_(nv, 'DoiPin', '');

  const nvMoi = findBy_(SHEETS.NHANVIEN, 'maNV', nv.maNV);
  return { token: taoToken_(nvMoi), me: hoSoCongKhai_(nvMoi) };
}

/** Cấu hình an toàn để gửi xuống trình duyệt (không chứa bí mật). */
function cauHinhChoClient_() {
  return {
    tenQuan: getCfg_('tenQuan', 'Quán Cà Phê'),
    diaChiQuan: getCfg_('diaChiQuan', ''),
    banKinhChamCong: getCfgNum_('banKinhChamCong', 0),
    batBuocViTri: getCfgBool_('batBuocViTri', true),
    yeuCauAnh: getCfgBool_('yeuCauAnh', false),
    choPhepTuDangKyCa: getCfgBool_('choPhepTuDangKyCa', true),
    hanBaoCaTruoc: getCfgNum_('hanBaoCaTruoc', 1),
    batBuocKiemKhoCuoiCa: getCfgBool_('batBuocKiemKhoCuoiCa', false),
    phutTreChoPhep: getCfgNum_('phutTreChoPhep', 5),
    serverTime: nowStamp_(),
    homNay: today_()
  };
}
