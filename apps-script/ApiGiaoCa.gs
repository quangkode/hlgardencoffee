/*******************************************************
 * ApiGiaoCa.gs — Biên bản giao ca
 *
 * Tiền mặt kỳ vọng = tienDauCa + (tongDoanhThu - tienChuyenKhoan)
 * chenhLech = tienMatCuoiCa - kỳ vọng   (âm = thiếu quỹ, dương = dư)
 * Người nhận ca bấm xác nhận => trangThai DaXacNhan.
 *******************************************************/

function gcDanhSachNguoiNhan_(nv) {
  const ma = String(nv.maNV).trim().toUpperCase();
  return readAll_(SHEETS.NHANVIEN)
    .filter(r => String(r.trangThai).trim() === 'DangLam' && String(r.maNV).trim().toUpperCase() !== ma)
    .map(r => ({ maNV: String(r.maNV).trim(), hoTen: String(r.hoTen || ''), chucVu: String(r.chucVu || '') }));
}

function tinhChenhLech_(o) {
  const kyVong = num_(o.tienDauCa) + (num_(o.tongDoanhThu) - num_(o.tienChuyenKhoan));
  return Math.round(num_(o.tienMatCuoiCa) - kyVong);
}

function gcGui_(nv, p) {
  const maCa = String(p.maCa || caGoiYHienTai_(nv)).trim().toUpperCase();
  if (!maCa) throw new Error('Chưa chọn ca.');

  const nvMap = mapNhanVien_();
  const maNhan = String(p.maNVNhan || '').trim().toUpperCase();
  if (maNhan && !nvMap[maNhan]) throw new Error('Người nhận ca không hợp lệ.');
  if (maNhan === String(nv.maNV).trim().toUpperCase()) throw new Error('Không thể giao ca cho chính mình.');

  const o = {
    tienDauCa: num_(p.tienDauCa),
    tienMatCuoiCa: num_(p.tienMatCuoiCa),
    tienChuyenKhoan: num_(p.tienChuyenKhoan),
    tongDoanhThu: num_(p.tongDoanhThu)
  };
  const chenh = tinhChenhLech_(o);

  const rec = {
    id: uid_('GC'), thoiGian: nowStamp_(), ngay: today_(), maCa: maCa,
    maNVGiao: nv.maNV, tenNVGiao: nv.hoTen,
    maNVNhan: maNhan, tenNVNhan: maNhan ? nvMap[maNhan].hoTen : '',
    tienDauCa: o.tienDauCa, tienMatCuoiCa: o.tienMatCuoiCa,
    tienChuyenKhoan: o.tienChuyenKhoan, tongDoanhThu: o.tongDoanhThu,
    soHoaDon: num_(p.soHoaDon), tienNopVe: num_(p.tienNopVe), chenhLech: chenh,
    tinhTrangThietBi: String(p.tinhTrangThietBi || 'Bình thường'),
    vanDe: String(p.vanDe || ''), ghiChu: String(p.ghiChu || ''),
    trangThai: maNhan ? 'ChoXacNhan' : 'DaXacNhan',
    thoiGianXacNhan: maNhan ? '' : nowStamp_()
  };

  withLock_(() => appendObj_(SHEETS.GIAOCA, rec));
  ghiNhatKy_(nv, 'GiaoCa', maCa + ' — doanh thu ' + o.tongDoanhThu + ', lệch ' + chenh);

  let tb = 'Đã gửi biên bản giao ca.';
  if (maNhan) tb += ' Chờ ' + nvMap[maNhan].hoTen + ' xác nhận.';
  if (chenh !== 0) tb += ' Quỹ tiền mặt ' + (chenh > 0 ? 'dư ' : 'thiếu ') + dinhDangTien_(Math.abs(chenh)) + '.';

  return { thongBao: tb, chenhLech: chenh, id: rec.id };
}

function dinhDangTien_(n) {
  return String(Math.round(num_(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
}

function mapGiaoCa_(r) {
  return {
    id: String(r.id), thoiGian: String(r.thoiGian || ''), ngay: dstr_(r.ngay),
    maCa: String(r.maCa || ''),
    maNVGiao: String(r.maNVGiao || ''), tenNVGiao: String(r.tenNVGiao || ''),
    maNVNhan: String(r.maNVNhan || ''), tenNVNhan: String(r.tenNVNhan || ''),
    tienDauCa: num_(r.tienDauCa), tienMatCuoiCa: num_(r.tienMatCuoiCa),
    tienChuyenKhoan: num_(r.tienChuyenKhoan), tongDoanhThu: num_(r.tongDoanhThu),
    soHoaDon: num_(r.soHoaDon), tienNopVe: num_(r.tienNopVe), chenhLech: num_(r.chenhLech),
    tinhTrangThietBi: String(r.tinhTrangThietBi || ''), vanDe: String(r.vanDe || ''),
    ghiChu: String(r.ghiChu || ''), trangThai: String(r.trangThai || ''),
    thoiGianXacNhan: String(r.thoiGianXacNhan || '')
  };
}

function gcDanhSach_(nv, p) {
  const tu = dstr_(p.tuNgay) || Utilities.formatDate(new Date(Date.now() - 7 * 86400000), TZ, 'yyyy-MM-dd');
  const den = dstr_(p.denNgay) || today_();
  const ma = String(nv.maNV).trim().toUpperCase();
  const laQL = laQuanLy_(nv);

  const ds = readAll_(SHEETS.GIAOCA)
    .filter(r => trongKhoang_(r.ngay, tu, den))
    .filter(r => laQL ||
      String(r.maNVGiao).trim().toUpperCase() === ma ||
      String(r.maNVNhan).trim().toUpperCase() === ma)
    .map(mapGiaoCa_)
    .sort((a, b) => b.thoiGian.localeCompare(a.thoiGian));

  return { tu: tu, den: den, danhSach: ds.slice(0, 100) };
}

function gcChoToiXacNhan_(nv) {
  const ma = String(nv.maNV).trim().toUpperCase();
  return {
    danhSach: readAll_(SHEETS.GIAOCA)
      .filter(r => String(r.maNVNhan).trim().toUpperCase() === ma &&
                   String(r.trangThai).trim() === 'ChoXacNhan')
      .map(mapGiaoCa_)
  };
}

function gcXacNhan_(nv, p) {
  const r = findBy_(SHEETS.GIAOCA, 'id', p.id);
  if (!r) throw new Error('Không tìm thấy biên bản.');
  const ma = String(nv.maNV).trim().toUpperCase();
  if (String(r.maNVNhan).trim().toUpperCase() !== ma && !laQuanLy_(nv)) {
    throw new Error('Bạn không phải người nhận ca này.');
  }
  if (String(r.trangThai).trim() === 'DaXacNhan') throw new Error('Biên bản đã được xác nhận.');

  patchRow_(SHEETS.GIAOCA, r._row, {
    trangThai: 'DaXacNhan',
    thoiGianXacNhan: nowStamp_(),
    ghiChu: [String(r.ghiChu || ''), 'Xác nhận bởi ' + nv.hoTen + (p.ghiChu ? ': ' + p.ghiChu : '')]
              .filter(String).join(' | ')
  });
  ghiNhatKy_(nv, 'XacNhanGiaoCa', String(r.id));
  return { thongBao: 'Đã xác nhận nhận ca.' };
}
