/*******************************************************
 * ApiCa.gs — Báo ca (nhân viên đăng ký) & lịch làm việc
 *
 * Trạng thái LichLamViec:
 *   ChoDuyet  — NV tự báo ca, đợi quản lý duyệt
 *   DaDuyet   — quản lý đã duyệt
 *   DuocXep   — quản lý xếp thẳng, không cần duyệt
 *   TuChoi    — quản lý từ chối
 *   Huy       — NV tự huỷ khi chưa duyệt
 *******************************************************/

function caDanhSach_() {
  const m = mapCa_();
  return Object.keys(m).map(k => ({
    maCa: m[k].maCa, tenCa: m[k].tenCa,
    gioBatDau: m[k].gioBatDau, gioKetThuc: m[k].gioKetThuc,
    soPhutNghi: m[k].soPhutNghi, heSoLuong: m[k].heSoLuong,
    trangThai: m[k].trangThai
  })).filter(c => c.trangThai === 'HoatDong');
}

function caCuaToi_(nv, p) {
  const k = khoangThang_(p.thang);
  const ma = String(nv.maNV).trim().toUpperCase();
  const dsCa = mapCa_();
  const cc = {};
  readAll_(SHEETS.CHAMCONG).forEach(r => {
    if (String(r.maNV).trim().toUpperCase() !== ma) return;
    cc[dstr_(r.ngay) + '|' + String(r.maCa).trim().toUpperCase()] = String(r.trangThai).trim();
  });

  const ds = readAll_(SHEETS.LICH)
    .filter(r => String(r.maNV).trim().toUpperCase() === ma && trongKhoang_(r.ngay, k.tu, k.den))
    .map(r => {
      const c = dsCa[String(r.maCa).trim().toUpperCase()];
      const ngay = dstr_(r.ngay);
      const maCa = String(r.maCa).trim().toUpperCase();
      return {
        id: r.id, ngay: ngay, maCa: maCa,
        tenCa: c ? c.tenCa : maCa,
        gioBatDau: c ? c.gioBatDau : '', gioKetThuc: c ? c.gioKetThuc : '',
        trangThai: String(r.trangThai || ''),
        ghiChuNV: String(r.ghiChuNV || ''), ghiChuQL: String(r.ghiChuQL || ''),
        tuXep: String(r.nguoiTao || '').toUpperCase() !== ma,
        daChamCong: cc[ngay + '|' + maCa] || ''
      };
    })
    .sort((a, b) => a.ngay.localeCompare(b.ngay) || a.gioBatDau.localeCompare(b.gioBatDau));

  return { thang: k.thang, tu: k.tu, den: k.den, danhSach: ds, dsCa: caDanhSach_() };
}

function caBaoCa_(nv, p) {
  if (!getCfgBool_('choPhepTuDangKyCa', true)) {
    throw new Error('Quản lý đang tắt tính năng tự báo ca. Liên hệ quản lý để được xếp ca.');
  }
  const items = Array.isArray(p.items) ? p.items : [{ ngay: p.ngay, maCa: p.maCa, ghiChu: p.ghiChu }];
  if (!items.length) throw new Error('Chưa chọn ca nào.');

  const dsCa = mapCa_();
  const han = getCfgNum_('hanBaoCaTruoc', 1);
  const hanNgay = Utilities.formatDate(new Date(Date.now() + han * 86400000), TZ, 'yyyy-MM-dd');

  return withLock_(() => {
    const daCo = {};
    const ma = String(nv.maNV).trim().toUpperCase();
    readAll_(SHEETS.LICH).forEach(r => {
      if (String(r.maNV).trim().toUpperCase() !== ma) return;
      if (['Huy', 'TuChoi'].indexOf(String(r.trangThai).trim()) >= 0) return;
      daCo[dstr_(r.ngay) + '|' + String(r.maCa).trim().toUpperCase()] = true;
    });

    const them = [];
    const boQua = [];
    items.forEach(it => {
      const ngay = dstr_(it.ngay);
      const maCa = String(it.maCa || '').trim().toUpperCase();
      if (!ngay || !maCa) return;
      if (!dsCa[maCa]) { boQua.push(ngay + ' ' + maCa + ' (ca không tồn tại)'); return; }
      if (ngay < hanNgay) {
        boQua.push(ngay + ' ' + dsCa[maCa].tenCa + ' (phải báo trước ' + han + ' ngày)');
        return;
      }
      if (daCo[ngay + '|' + maCa]) { boQua.push(ngay + ' ' + dsCa[maCa].tenCa + ' (đã báo rồi)'); return; }
      daCo[ngay + '|' + maCa] = true;
      them.push({
        id: uid_('LC'), maNV: nv.maNV, hoTen: nv.hoTen,
        ngay: ngay, maCa: maCa, trangThai: 'ChoDuyet',
        ghiChuNV: String(it.ghiChu || p.ghiChu || ''), ghiChuQL: '',
        nguoiTao: nv.maNV, thoiGianTao: nowStamp_(), nguoiDuyet: '', thoiGianDuyet: ''
      });
    });

    appendMany_(SHEETS.LICH, them);
    if (them.length) ghiNhatKy_(nv, 'BaoCa', them.map(t => t.ngay + ' ' + t.maCa).join(', '));
    if (!them.length) throw new Error('Không báo được ca nào.\n• ' + boQua.join('\n• '));

    return {
      thongBao: 'Đã gửi ' + them.length + ' ca, chờ quản lý duyệt.' +
                (boQua.length ? '\nBỏ qua: ' + boQua.join('; ') : ''),
      soCa: them.length
    };
  });
}

function caHuyBaoCa_(nv, p) {
  const r = findBy_(SHEETS.LICH, 'id', p.id);
  if (!r) throw new Error('Không tìm thấy ca này.');
  if (String(r.maNV).trim().toUpperCase() !== String(nv.maNV).trim().toUpperCase()) {
    throw new Error('Đây không phải ca của bạn.');
  }
  const tt = String(r.trangThai).trim();
  if (tt === 'Huy') throw new Error('Ca này đã huỷ rồi.');
  if (tt === 'DaDuyet' || tt === 'DuocXep') {
    if (dstr_(r.ngay) <= today_()) throw new Error('Ca đã duyệt và đến hạn — báo trực tiếp quản lý nhé.');
  }
  patchRow_(SHEETS.LICH, r._row, {
    trangThai: 'Huy',
    ghiChuNV: [String(r.ghiChuNV || ''), 'NV huỷ ' + nowStamp_()].filter(String).join(' | ')
  });
  ghiNhatKy_(nv, 'HuyBaoCa', dstr_(r.ngay) + ' ' + r.maCa);
  return { thongBao: 'Đã huỷ ca ' + dstr_(r.ngay) + '.' };
}
