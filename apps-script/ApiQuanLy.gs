/*******************************************************
 * ApiQuanLy.gs — Toàn bộ nghiệp vụ phía quản lý
 *******************************************************/

/* ================= TỔNG QUAN ================= */

function qlTongQuan_(nv, p) {
  const homNay = dstr_(p.ngay) || today_();
  const dsCa = mapCa_();
  const cc = readAll_(SHEETS.CHAMCONG);

  let dangLam = 0, caHomNay = 0, phutHomNay = 0, treHomNay = 0, ngoaiVung = 0, quenRa = 0;
  const danhSachHomNay = [];

  cc.forEach(r => {
    const ngay = dstr_(r.ngay);
    const tt = String(r.trangThai).trim();
    if (tt === 'DangLam') {
      // Ca mở từ trước hôm qua là ca bỏ quên, không phải người đang đứng quán.
      // Đếm tách ra để con số "đang trong ca" luôn đúng thực tế.
      const boQuen = ngay < Utilities.formatDate(new Date(Date.now() - 86400000), TZ, 'yyyy-MM-dd');
      if (boQuen) quenRa++; else dangLam++;
    }
    if (ngay !== homNay) return;
    caHomNay++;
    phutHomNay += num_(r.soPhutLam);
    if (num_(r.soPhutTre) > getCfgNum_('phutTreChoPhep', 5)) treHomNay++;
    if (bool_(r.ngoaiVung)) ngoaiVung++;
    const c = dsCa[String(r.maCa).trim().toUpperCase()];
    danhSachHomNay.push({
      id: String(r.id), maNV: String(r.maNV), hoTen: String(r.hoTen || ''),
      maCa: String(r.maCa || ''), tenCa: c ? c.tenCa : String(r.maCa || ''),
      gioVao: tstr_(r.gioVao), gioRa: tstr_(r.gioRa),
      soPhutLam: num_(r.soPhutLam), soPhutTre: num_(r.soPhutTre),
      trangThai: String(r.trangThai || ''), ngoaiVung: bool_(r.ngoaiVung),
      ngoaiLich: bool_(r.ngoaiLich)
    });
  });

  const choDuyet = readAll_(SHEETS.LICH)
    .filter(r => String(r.trangThai).trim() === 'ChoDuyet').length;

  const gc = readAll_(SHEETS.GIAOCA);
  const choXacNhan = gc.filter(r => String(r.trangThai).trim() === 'ChoXacNhan').length;
  let doanhThuHomNay = 0, lechQuyHomNay = 0, soBienBanHomNay = 0;
  gc.forEach(r => {
    if (dstr_(r.ngay) !== homNay) return;
    soBienBanHomNay++;
    doanhThuHomNay += num_(r.tongDoanhThu);
    lechQuyHomNay += num_(r.chenhLech);
  });

  // Hàng dưới định mức theo lần kiểm gần nhất
  const ton = tonGanNhat_();
  const cbKho = [];
  khoDanhMuc_().forEach(h => {
    if (h.tonDinhMuc <= 0) return;
    const t = ton[h.maHang];
    if (!t) return;
    if (t.thucTe < h.tonDinhMuc) {
      cbKho.push({ tenHang: h.tenHang, con: t.thucTe, donVi: h.donVi, dinhMuc: h.tonDinhMuc });
    }
  });

  const soNV = readAll_(SHEETS.NHANVIEN).filter(r => String(r.trangThai).trim() === 'DangLam').length;

  // Lương tạm tính tháng này
  const luong = tinhLuongThang_(thangHienTai_());
  const tongLuong = luong.danhSach.reduce((s, x) => s + x.thucNhan, 0);

  return {
    ngay: homNay, serverTime: nowStamp_(),
    soNhanVien: soNV,
    dangLam: dangLam, quenChamRa: quenRa,
    caHomNay: caHomNay, gioHomNay: Math.round(phutHomNay / 6) / 10,
    treHomNay: treHomNay, ngoaiVung: ngoaiVung,
    caChoDuyet: choDuyet, giaoCaChoXacNhan: choXacNhan,
    doanhThuHomNay: doanhThuHomNay, lechQuyHomNay: lechQuyHomNay, soBienBanHomNay: soBienBanHomNay,
    canhBaoKho: cbKho.slice(0, 12), soCanhBaoKho: cbKho.length,
    thangHienTai: luong.thang, tongLuongTamTinh: tongLuong,
    danhSachHomNay: danhSachHomNay.sort((a, b) => (b.gioVao || '').localeCompare(a.gioVao || ''))
  };
}

function qlDangTrongCa_(nv) {
  const dsCa = mapCa_();
  const ds = readAll_(SHEETS.CHAMCONG)
    .filter(r => String(r.trangThai).trim() === 'DangLam')
    .map(r => {
      const c = dsCa[String(r.maCa).trim().toUpperCase()];
      const vao = phutTuChuoi_(tstr_(r.gioVao));
      const ngay = dstr_(r.ngay);
      let daLam = phutTuChuoi_(nowTime_()) - vao;
      if (ngay !== today_() || daLam < 0) daLam += 1440;
      const boQuen = ngay < Utilities.formatDate(new Date(Date.now() - 86400000), TZ, 'yyyy-MM-dd');
      return {
        id: String(r.id), maNV: String(r.maNV), hoTen: String(r.hoTen || ''),
        ngay: ngay, maCa: String(r.maCa || ''), tenCa: c ? c.tenCa : '',
        gioVao: tstr_(r.gioVao), daLamPhut: daLam, boQuen: boQuen,
        soPhutTre: num_(r.soPhutTre), ngoaiVung: bool_(r.ngoaiVung)
      };
    })
    .sort((a, b) => (a.ngay + a.gioVao).localeCompare(b.ngay + b.gioVao));
  return { serverTime: nowStamp_(), danhSach: ds };
}

/* ================= NHÂN VIÊN ================= */

function qlDsNhanVien_(nv) {
  return {
    danhSach: readAll_(SHEETS.NHANVIEN).map(r => ({
      maNV: String(r.maNV).trim(), hoTen: String(r.hoTen || ''),
      soDienThoai: String(r.soDienThoai || ''), chucVu: String(r.chucVu || 'NhanVien').trim(),
      luongTheoGio: num_(r.luongTheoGio), phuCapCa: num_(r.phuCapCa),
      ngayVaoLam: dstr_(r.ngayVaoLam), trangThai: String(r.trangThai || 'DangLam').trim(),
      doiPinLanDau: bool_(r.doiPinLanDau), ghiChu: String(r.ghiChu || '')
    })),
    macDinh: {
      luongGioMacDinh: getCfgNum_('luongGioMacDinh', 25000),
      phuCapCaMacDinh: getCfgNum_('phuCapCaMacDinh', 0)
    }
  };
}

function qlLuuNhanVien_(nv, p) {
  const ma = String(p.maNV || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,20}$/.test(ma)) throw new Error('Mã nhân viên chỉ gồm chữ/số, 2–20 ký tự (vd: NV002).');
  if (!String(p.hoTen || '').trim()) throw new Error('Chưa nhập họ tên.');

  return withLock_(() => {
    const cu = findBy_(SHEETS.NHANVIEN, 'maNV', ma);

    if (!cu) {
      const pinDau = String(p.pin || '1234').trim();
      if (!/^\d{4,10}$/.test(pinDau)) throw new Error('PIN ban đầu phải là 4–10 chữ số.');
      taoNhanVien_({
        maNV: ma, hoTen: p.hoTen, soDienThoai: p.soDienThoai, chucVu: p.chucVu,
        luongTheoGio: p.luongTheoGio, phuCapCa: p.phuCapCa,
        ngayVaoLam: p.ngayVaoLam, trangThai: p.trangThai || 'DangLam', ghiChu: p.ghiChu
      }, pinDau);
      ghiNhatKy_(nv, 'ThemNhanVien', ma);
      return { thongBao: 'Đã thêm ' + p.hoTen + ' (PIN đăng nhập: ' + pinDau + ').' };
    }

    // Không cho tự hạ quyền chính mình -> tránh khoá hết cửa quản lý
    if (ma === String(nv.maNV).trim().toUpperCase()) {
      if (String(p.chucVu).trim() !== 'QuanLy') throw new Error('Không thể tự bỏ quyền quản lý của chính mình.');
      if (String(p.trangThai || 'DangLam').trim() !== 'DangLam') throw new Error('Không thể tự khoá tài khoản của chính mình.');
    }

    patchRow_(SHEETS.NHANVIEN, cu._row, {
      hoTen: String(p.hoTen).trim(),
      soDienThoai: String(p.soDienThoai || '').trim(),
      chucVu: String(p.chucVu).trim() === 'QuanLy' ? 'QuanLy' : 'NhanVien',
      luongTheoGio: num_(p.luongTheoGio),
      phuCapCa: num_(p.phuCapCa),
      ngayVaoLam: dstr_(p.ngayVaoLam) || dstr_(cu.ngayVaoLam),
      trangThai: String(p.trangThai || 'DangLam').trim(),
      ghiChu: String(p.ghiChu || '')
    });
    ghiNhatKy_(nv, 'SuaNhanVien', ma);
    return { thongBao: 'Đã cập nhật ' + p.hoTen + '.' };
  });
}

function qlResetPin_(nv, p) {
  const ma = String(p.maNV || '').trim().toUpperCase();
  const cu = findBy_(SHEETS.NHANVIEN, 'maNV', ma);
  if (!cu) throw new Error('Không tìm thấy nhân viên.');
  const pin = String(p.pin || '1234').trim();
  if (!/^\d{4,10}$/.test(pin)) throw new Error('PIN phải là 4–10 chữ số.');
  const s = taoHashPin_(pin);
  patchRow_(SHEETS.NHANVIEN, cu._row, { pinHash: s.hash, pinSalt: s.salt, doiPinLanDau: 'TRUE' });
  ghiNhatKy_(nv, 'ResetPin', ma);
  return { thongBao: 'Đã đặt PIN của ' + cu.hoTen + ' thành ' + pin + '. Nhân viên phải đổi PIN khi đăng nhập.' };
}

/* ================= CHẤM CÔNG ================= */

/** Tính lại số phút cho 1 bản ghi chấm công sau khi sửa tay. */
function tinhLaiChamCong_(ngay, maCa, gioVao, gioRa) {
  const ca = mapCa_()[String(maCa).trim().toUpperCase()];
  const pVao = phutTuChuoi_(gioVao);
  if (pVao < 0) throw new Error('Giờ vào không hợp lệ (định dạng HH:mm).');

  const out = { soPhutTre: ca ? Math.max(0, lechPhut_(pVao, ca.phutBatDau % 1440)) : 0 };

  if (!gioRa) {
    out.soPhutLam = '';
    out.soPhutVeSom = '';
    out.trangThai = 'DangLam';
    return out;
  }
  const pRa = phutTuChuoi_(gioRa);
  if (pRa < 0) throw new Error('Giờ ra không hợp lệ (định dạng HH:mm).');

  let lam = pRa - pVao;
  if (lam < 0) lam += 1440;
  if (lam > 1080) throw new Error('Ca dài hơn 18 tiếng, kiểm tra lại giờ.');

  out.soPhutLam = lamTron_(Math.max(0, lam - (ca ? ca.soPhutNghi : 0)));
  out.soPhutVeSom = ca ? Math.max(0, lechPhut_(ca.phutKetThuc % 1440, pRa)) : 0;
  out.trangThai = 'HoanThanh';
  return out;
}

function qlChamCong_(nv, p) {
  const k = p.thang ? khoangThang_(p.thang) : {
    tu: dstr_(p.tuNgay) || Utilities.formatDate(new Date(Date.now() - 14 * 86400000), TZ, 'yyyy-MM-dd'),
    den: dstr_(p.denNgay) || today_()
  };
  const locNV = String(p.maNV || '').trim().toUpperCase();
  const dsCa = mapCa_();

  const ds = readAll_(SHEETS.CHAMCONG)
    .filter(r => trongKhoang_(r.ngay, k.tu, k.den))
    .filter(r => !locNV || String(r.maNV).trim().toUpperCase() === locNV)
    .map(r => {
      const c = dsCa[String(r.maCa).trim().toUpperCase()];
      return {
        id: String(r.id), maNV: String(r.maNV), hoTen: String(r.hoTen || ''),
        ngay: dstr_(r.ngay), maCa: String(r.maCa || ''), tenCa: c ? c.tenCa : String(r.maCa || ''),
        gioVao: tstr_(r.gioVao), gioRa: tstr_(r.gioRa),
        soPhutLam: num_(r.soPhutLam), soPhutTre: num_(r.soPhutTre), soPhutVeSom: num_(r.soPhutVeSom),
        trangThai: String(r.trangThai || ''),
        ngoaiVung: bool_(r.ngoaiVung), ngoaiLich: bool_(r.ngoaiLich),
        khoangCachVao: r.khoangCachVao === '' ? '' : num_(r.khoangCachVao),
        anhVao: String(r.anhVao || ''), anhRa: String(r.anhRa || ''),
        ghiChu: String(r.ghiChu || ''), nguoiSua: String(r.nguoiSua || '')
      };
    })
    .sort((a, b) => (b.ngay + b.gioVao).localeCompare(a.ngay + a.gioVao));

  let tongPhut = 0;
  ds.forEach(r => { tongPhut += r.soPhutLam; });

  return {
    tu: k.tu, den: k.den, danhSach: ds,
    tong: { soCa: ds.length, tongGio: Math.round(tongPhut / 6) / 10 }
  };
}

function qlSuaChamCong_(nv, p) {
  const r = findBy_(SHEETS.CHAMCONG, 'id', p.id);
  if (!r) throw new Error('Không tìm thấy bản ghi chấm công.');

  const ngay = dstr_(p.ngay) || dstr_(r.ngay);
  const maCa = String(p.maCa || r.maCa).trim().toUpperCase();
  const gioVao = tstr_(p.gioVao !== undefined ? p.gioVao : r.gioVao);
  const gioRa = tstr_(p.gioRa !== undefined ? p.gioRa : r.gioRa);

  const tinh = tinhLaiChamCong_(ngay, maCa, gioVao, gioRa);
  patchRow_(SHEETS.CHAMCONG, r._row, {
    ngay: ngay, maCa: maCa, gioVao: gioVao, gioRa: gioRa,
    soPhutLam: tinh.soPhutLam, soPhutTre: tinh.soPhutTre, soPhutVeSom: tinh.soPhutVeSom,
    trangThai: tinh.trangThai,
    ghiChu: String(p.ghiChu !== undefined ? p.ghiChu : (r.ghiChu || '')),
    nguoiSua: nv.maNV, thoiGianSua: nowStamp_()
  });
  ghiNhatKy_(nv, 'SuaChamCong', p.id + ' -> ' + ngay + ' ' + gioVao + '-' + gioRa);
  return { thongBao: 'Đã cập nhật công của ' + r.hoTen + ' ngày ' + ngay + '.' };
}

function qlThemChamCong_(nv, p) {
  const ma = String(p.maNV || '').trim().toUpperCase();
  const nvT = findBy_(SHEETS.NHANVIEN, 'maNV', ma);
  if (!nvT) throw new Error('Không tìm thấy nhân viên.');
  const ngay = dstr_(p.ngay);
  if (!ngay) throw new Error('Chưa chọn ngày.');
  const maCa = String(p.maCa || '').trim().toUpperCase();
  if (!mapCa_()[maCa]) throw new Error('Chưa chọn ca.');

  const tinh = tinhLaiChamCong_(ngay, maCa, tstr_(p.gioVao), tstr_(p.gioRa));
  const rec = {
    id: uid_('CC'), maNV: ma, hoTen: nvT.hoTen, ngay: ngay, maCa: maCa,
    gioVao: tstr_(p.gioVao), gioRa: tstr_(p.gioRa),
    soPhutLam: tinh.soPhutLam, soPhutTre: tinh.soPhutTre, soPhutVeSom: tinh.soPhutVeSom,
    trangThai: tinh.trangThai,
    viTriVao: '', khoangCachVao: '', viTriRa: '', khoangCachRa: '',
    ngoaiVung: 'FALSE', ngoaiLich: 'FALSE', anhVao: '', anhRa: '',
    ghiChu: String(p.ghiChu || 'Quản lý nhập tay'),
    nguoiSua: nv.maNV, thoiGianSua: nowStamp_()
  };
  withLock_(() => appendObj_(SHEETS.CHAMCONG, rec));
  ghiNhatKy_(nv, 'ThemChamCong', ma + ' ' + ngay + ' ' + maCa);
  return { thongBao: 'Đã thêm công cho ' + nvT.hoTen + ' ngày ' + ngay + '.' };
}

function qlXoaChamCong_(nv, p) {
  const r = findBy_(SHEETS.CHAMCONG, 'id', p.id);
  if (!r) throw new Error('Không tìm thấy bản ghi.');
  deleteRow_(SHEETS.CHAMCONG, r._row);
  ghiNhatKy_(nv, 'XoaChamCong', p.id + ' (' + r.maNV + ' ' + dstr_(r.ngay) + ')');
  return { thongBao: 'Đã xoá bản ghi chấm công.' };
}

/* ================= LỊCH CA / DUYỆT BÁO CA ================= */

function qlLichCa_(nv, p) {
  const tu = dstr_(p.tuNgay) || today_();
  const den = dstr_(p.denNgay) ||
              Utilities.formatDate(new Date(Date.now() + 13 * 86400000), TZ, 'yyyy-MM-dd');
  const dsCa = mapCa_();

  const ds = readAll_(SHEETS.LICH)
    .filter(r => trongKhoang_(r.ngay, tu, den))
    .filter(r => !p.chiChoDuyet || String(r.trangThai).trim() === 'ChoDuyet')
    .map(r => {
      const c = dsCa[String(r.maCa).trim().toUpperCase()];
      return {
        id: String(r.id), maNV: String(r.maNV), hoTen: String(r.hoTen || ''),
        ngay: dstr_(r.ngay), maCa: String(r.maCa || ''), tenCa: c ? c.tenCa : String(r.maCa || ''),
        gioBatDau: c ? c.gioBatDau : '', gioKetThuc: c ? c.gioKetThuc : '',
        trangThai: String(r.trangThai || ''),
        ghiChuNV: String(r.ghiChuNV || ''), ghiChuQL: String(r.ghiChuQL || ''),
        thoiGianTao: String(r.thoiGianTao || '')
      };
    })
    .sort((a, b) => a.ngay.localeCompare(b.ngay) || a.gioBatDau.localeCompare(b.gioBatDau) ||
                    a.hoTen.localeCompare(b.hoTen));

  return {
    tu: tu, den: den, danhSach: ds, dsCa: caDanhSach_(),
    dsNhanVien: readAll_(SHEETS.NHANVIEN)
      .filter(r => String(r.trangThai).trim() === 'DangLam')
      .map(r => ({ maNV: String(r.maNV).trim(), hoTen: String(r.hoTen || '') }))
  };
}

function qlDuyetCa_(nv, p) {
  const ids = Array.isArray(p.ids) ? p.ids : [p.id];
  const duyet = !!p.duyet;
  const rows = readAll_(SHEETS.LICH);
  let n = 0;
  ids.forEach(id => {
    const r = rows.filter(x => String(x.id) === String(id))[0];
    if (!r) return;
    patchRow_(SHEETS.LICH, r._row, {
      trangThai: duyet ? 'DaDuyet' : 'TuChoi',
      ghiChuQL: String(p.ghiChu || ''),
      nguoiDuyet: nv.maNV, thoiGianDuyet: nowStamp_()
    });
    n++;
  });
  ghiNhatKy_(nv, duyet ? 'DuyetCa' : 'TuChoiCa', ids.join(','));
  return { thongBao: (duyet ? 'Đã duyệt ' : 'Đã từ chối ') + n + ' ca.' };
}

function qlXepCa_(nv, p) {
  const items = Array.isArray(p.items) ? p.items : [{ maNV: p.maNV, ngay: p.ngay, maCa: p.maCa }];
  const nvMap = mapNhanVien_();
  const dsCa = mapCa_();

  return withLock_(() => {
    const daCo = {};
    readAll_(SHEETS.LICH).forEach(r => {
      if (['Huy', 'TuChoi'].indexOf(String(r.trangThai).trim()) >= 0) return;
      daCo[String(r.maNV).trim().toUpperCase() + '|' + dstr_(r.ngay) + '|' + String(r.maCa).trim().toUpperCase()] = true;
    });

    const them = [];
    items.forEach(it => {
      const ma = String(it.maNV || '').trim().toUpperCase();
      const ngay = dstr_(it.ngay);
      const maCa = String(it.maCa || '').trim().toUpperCase();
      if (!nvMap[ma] || !ngay || !dsCa[maCa]) return;
      const key = ma + '|' + ngay + '|' + maCa;
      if (daCo[key]) return;
      daCo[key] = true;
      them.push({
        id: uid_('LC'), maNV: ma, hoTen: nvMap[ma].hoTen, ngay: ngay, maCa: maCa,
        trangThai: 'DuocXep', ghiChuNV: '', ghiChuQL: String(p.ghiChu || ''),
        nguoiTao: nv.maNV, thoiGianTao: nowStamp_(),
        nguoiDuyet: nv.maNV, thoiGianDuyet: nowStamp_()
      });
    });
    appendMany_(SHEETS.LICH, them);
    if (!them.length) throw new Error('Không xếp được ca nào (trùng lịch hoặc dữ liệu không hợp lệ).');
    ghiNhatKy_(nv, 'XepCa', them.map(t => t.maNV + ' ' + t.ngay + ' ' + t.maCa).join(', '));
    return { thongBao: 'Đã xếp ' + them.length + ' ca.' };
  });
}

function qlXoaLichCa_(nv, p) {
  const r = findBy_(SHEETS.LICH, 'id', p.id);
  if (!r) throw new Error('Không tìm thấy ca.');
  deleteRow_(SHEETS.LICH, r._row);
  ghiNhatKy_(nv, 'XoaLichCa', p.id);
  return { thongBao: 'Đã xoá ca khỏi lịch.' };
}

function qlLuuCa_(nv, p) {
  const ma = String(p.maCa || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,10}$/.test(ma)) throw new Error('Mã ca chỉ gồm chữ/số, 2–10 ký tự (vd: CA1).');
  if (phutTuChuoi_(tstr_(p.gioBatDau)) < 0) throw new Error('Giờ bắt đầu không hợp lệ (HH:mm).');
  if (phutTuChuoi_(tstr_(p.gioKetThuc)) < 0) throw new Error('Giờ kết thúc không hợp lệ (HH:mm).');

  const obj = {
    maCa: ma, tenCa: String(p.tenCa || ma).trim(),
    gioBatDau: tstr_(p.gioBatDau), gioKetThuc: tstr_(p.gioKetThuc),
    soPhutNghi: num_(p.soPhutNghi), heSoLuong: num_(p.heSoLuong) || 1,
    trangThai: String(p.trangThai || 'HoatDong').trim(), ghiChu: String(p.ghiChu || '')
  };
  const cu = findBy_(SHEETS.CA, 'maCa', ma);
  if (cu) writeRow_(SHEETS.CA, cu._row, obj); else appendObj_(SHEETS.CA, obj);
  ghiNhatKy_(nv, 'LuuCa', ma);
  return { thongBao: 'Đã lưu ca ' + obj.tenCa + '.' };
}

/* ================= LƯƠNG ================= */

function qlBangLuong_(nv, p) {
  const r = tinhLuongThang_(p.thang, p.maNV);
  const tong = { soNV: r.danhSach.length, tongGio: 0, tongLuong: 0, tongThuong: 0, tongPhat: 0, soCa: 0 };
  r.danhSach.forEach(x => {
    tong.tongGio += x.tongGio; tong.tongLuong += x.thucNhan;
    tong.tongThuong += x.thuong; tong.tongPhat += x.phat + x.phatTre; tong.soCa += x.soCa;
  });
  tong.tongGio = Math.round(tong.tongGio * 10) / 10;
  r.tong = tong;
  return r;
}

function qlChotLuong_(nv, p) {
  const r = tinhLuongThang_(p.thang);
  const k = khoangThang_(p.thang);

  return withLock_(() => {
    // Xoá bản chốt cũ của tháng này (xoá từ dưới lên để không lệch chỉ số dòng)
    const cu = readAll_(SHEETS.BANGLUONG)
      .filter(x => String(x.thang).slice(0, 7) === k.thang)
      .sort((a, b) => b._row - a._row);
    cu.forEach(x => deleteRow_(SHEETS.BANGLUONG, x._row));

    const stamp = nowStamp_();
    const rows = r.danhSach.map(x => ({
      id: uid_('BL'), thang: k.thang, maNV: x.maNV, hoTen: x.hoTen,
      soCa: x.soCa, tongPhutLam: x.tongPhutLam, tongGio: x.tongGio,
      luongTheoGio: x.luongTheoGio, luongCa: x.luongCa, phuCap: x.phuCap,
      thuong: x.thuong, phat: x.phat, phatTre: x.phatTre, thucNhan: x.thucNhan,
      trangThai: 'DaChot', nguoiChot: nv.maNV, thoiGianChot: stamp
    }));
    appendMany_(SHEETS.BANGLUONG, rows);
    ghiNhatKy_(nv, 'ChotLuong', k.thang + ' — ' + rows.length + ' NV');
    return {
      thongBao: 'Đã chốt lương tháng ' + k.thang + ' cho ' + rows.length +
                ' nhân viên. Xem chi tiết ở sheet BangLuong.'
    };
  });
}

function qlThuongPhat_(nv, p) {
  const thang = khoangThang_(p.thang).thang;
  const ds = readAll_(SHEETS.THUONGPHAT)
    .filter(r => String(r.thang).slice(0, 7) === thang)
    .filter(r => !p.maNV || String(r.maNV).trim().toUpperCase() === String(p.maNV).trim().toUpperCase())
    .map(r => ({
      id: String(r.id), thang: String(r.thang).slice(0, 7), maNV: String(r.maNV),
      hoTen: String(r.hoTen || ''), loai: String(r.loai || ''), soTien: num_(r.soTien),
      lyDo: String(r.lyDo || ''), nguoiTao: String(r.nguoiTao || ''), thoiGian: String(r.thoiGian || '')
    }))
    .sort((a, b) => b.thoiGian.localeCompare(a.thoiGian));
  return { thang: thang, danhSach: ds };
}

function qlLuuThuongPhat_(nv, p) {
  const ma = String(p.maNV || '').trim().toUpperCase();
  const nvT = findBy_(SHEETS.NHANVIEN, 'maNV', ma);
  if (!nvT) throw new Error('Chưa chọn nhân viên.');
  const tien = num_(p.soTien);
  if (tien <= 0) throw new Error('Số tiền phải lớn hơn 0.');
  const loai = String(p.loai).trim() === 'Phat' ? 'Phat' : 'Thuong';
  const thang = khoangThang_(p.thang).thang;

  const rec = {
    id: p.id || uid_('TP'), thang: thang, maNV: ma, hoTen: nvT.hoTen,
    loai: loai, soTien: tien, lyDo: String(p.lyDo || ''),
    nguoiTao: nv.maNV, thoiGian: nowStamp_()
  };
  const cu = p.id ? findBy_(SHEETS.THUONGPHAT, 'id', p.id) : null;
  if (cu) writeRow_(SHEETS.THUONGPHAT, cu._row, rec); else appendObj_(SHEETS.THUONGPHAT, rec);
  ghiNhatKy_(nv, 'ThuongPhat', loai + ' ' + ma + ' ' + tien);
  return { thongBao: 'Đã lưu ' + (loai === 'Thuong' ? 'thưởng' : 'phạt') + ' cho ' + nvT.hoTen + '.' };
}

function qlXoaThuongPhat_(nv, p) {
  const r = findBy_(SHEETS.THUONGPHAT, 'id', p.id);
  if (!r) throw new Error('Không tìm thấy mục này.');
  deleteRow_(SHEETS.THUONGPHAT, r._row);
  ghiNhatKy_(nv, 'XoaThuongPhat', p.id);
  return { thongBao: 'Đã xoá.' };
}

/* ================= KHO ================= */

function qlKho_(nv, p) {
  const tu = dstr_(p.tuNgay) || Utilities.formatDate(new Date(Date.now() - 7 * 86400000), TZ, 'yyyy-MM-dd');
  const den = dstr_(p.denNgay) || today_();
  const rows = readAll_(SHEETS.KIEMKHO).filter(r => trongKhoang_(r.ngay, tu, den));

  // Tổng hao hụt theo mặt hàng + quy ra tiền
  const dm = {};
  khoDanhMuc_().forEach(h => { dm[h.maHang] = h; });
  const ton = tonGanNhat_();
  const theoHang = {};
  rows.forEach(r => {
    const ma = String(r.maHang);
    if (!theoHang[ma]) {
      theoHang[ma] = {
        maHang: ma, tenHang: String(r.tenHang || ''), donVi: String(r.donVi || ''),
        tongHao: 0, soLanKiem: 0, tonHienTai: ton[ma] ? ton[ma].thucTe : 0,
        tonDinhMuc: dm[ma] ? dm[ma].tonDinhMuc : 0, giaVon: dm[ma] ? dm[ma].giaVon : 0
      };
    }
    theoHang[ma].tongHao += num_(r.haoHut);
    theoHang[ma].soLanKiem++;
  });
  const tk = Object.keys(theoHang).map(k => {
    const x = theoHang[k];
    x.tongHao = Math.round(x.tongHao * 1000) / 1000;
    x.tienHao = Math.round(x.tongHao * x.giaVon);
    x.duoiDinhMuc = x.tonDinhMuc > 0 && x.tonHienTai < x.tonDinhMuc;
    return x;
  }).sort((a, b) => b.tienHao - a.tienHao);

  return {
    tu: tu, den: den,
    phieu: gomPhieuKho_(rows).slice(0, 60),
    thongKe: tk,
    danhMuc: readAll_(SHEETS.HANG).map(r => ({
      maHang: String(r.maHang).trim(), tenHang: String(r.tenHang || ''), donVi: String(r.donVi || ''),
      nhomHang: String(r.nhomHang || ''), tonDinhMuc: num_(r.tonDinhMuc), giaVon: num_(r.giaVon),
      trangThai: String(r.trangThai || 'HoatDong').trim()
    }))
  };
}

function qlLuuHang_(nv, p) {
  const ma = String(p.maHang || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,20}$/.test(ma)) throw new Error('Mã hàng chỉ gồm chữ/số, 2–20 ký tự (vd: H013).');
  if (!String(p.tenHang || '').trim()) throw new Error('Chưa nhập tên hàng.');

  const obj = {
    maHang: ma, tenHang: String(p.tenHang).trim(), donVi: String(p.donVi || '').trim(),
    nhomHang: String(p.nhomHang || 'Khác').trim(), tonDinhMuc: num_(p.tonDinhMuc),
    giaVon: num_(p.giaVon), trangThai: String(p.trangThai || 'HoatDong').trim()
  };
  const cu = findBy_(SHEETS.HANG, 'maHang', ma);
  if (cu) writeRow_(SHEETS.HANG, cu._row, obj); else appendObj_(SHEETS.HANG, obj);
  ghiNhatKy_(nv, 'LuuHang', ma);
  return { thongBao: 'Đã lưu mặt hàng ' + obj.tenHang + '.' };
}

function qlXoaHang_(nv, p) {
  const cu = findBy_(SHEETS.HANG, 'maHang', p.maHang);
  if (!cu) throw new Error('Không tìm thấy mặt hàng.');
  // Không xoá hẳn để giữ lịch sử kiểm kho — chỉ ngừng theo dõi
  patchRow_(SHEETS.HANG, cu._row, { trangThai: 'NgungTheoDoi' });
  ghiNhatKy_(nv, 'NgungTheoDoiHang', String(p.maHang));
  return { thongBao: 'Đã ngừng theo dõi mặt hàng này (lịch sử vẫn giữ).' };
}

/* ================= GIAO CA (quản lý) ================= */

function qlGiaoCa_(nv, p) {
  const r = gcDanhSach_(nv, p);
  let doanhThu = 0, lech = 0, tienMat = 0, ck = 0, hoaDon = 0;
  r.danhSach.forEach(x => {
    doanhThu += x.tongDoanhThu; lech += x.chenhLech;
    tienMat += x.tienMatCuoiCa; ck += x.tienChuyenKhoan; hoaDon += x.soHoaDon;
  });
  r.tong = {
    soBienBan: r.danhSach.length, doanhThu: doanhThu, chenhLech: lech,
    tienMat: tienMat, chuyenKhoan: ck, soHoaDon: hoaDon
  };
  return r;
}

/* ================= CÀI ĐẶT ================= */

function qlDocCaiDat_(nv) {
  const rows = readAll_(SHEETS.CAIDAT).map(r => ({
    key: String(r.key).trim(), value: String(r.value == null ? '' : r.value), moTa: String(r.moTa || '')
  }));
  return { caiDat: rows, linkSheet: ss_().getUrl(), dsCa: readAll_(SHEETS.CA).map(r => ({
    maCa: String(r.maCa).trim(), tenCa: String(r.tenCa || ''),
    gioBatDau: tstr_(r.gioBatDau), gioKetThuc: tstr_(r.gioKetThuc),
    soPhutNghi: num_(r.soPhutNghi), heSoLuong: num_(r.heSoLuong) || 1,
    trangThai: String(r.trangThai || 'HoatDong').trim(), ghiChu: String(r.ghiChu || '')
  })) };
}

function qlLuuCaiDat_(nv, p) {
  const data = p.caiDat || {};
  const n = setCfgNhieu_(data);
  ghiNhatKy_(nv, 'LuuCaiDat', Object.keys(data).join(','));
  return { thongBao: 'Đã lưu ' + n + ' cài đặt.', cauHinh: cauHinhChoClient_() };
}
