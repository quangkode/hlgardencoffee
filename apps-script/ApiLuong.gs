/*******************************************************
 * ApiLuong.gs — Tính lương từ dữ liệu chấm công
 *
 * Công thức 1 ca — mọi ca tính như nhau, không hệ số, không phạt trễ:
 *   tienCa   = (soPhutLam / 60) * luongTheoGio
 *   phuCap   = phuCapCa nếu soPhutLam >= nguongPhutTinhPhuCap (mặc định phuCapCa = 0)
 * Cộng thêm Thưởng/Phạt thủ công quản lý nhập trong tháng.
 *   thucNhan = luongCa + phuCap + thuong - phat
 *
 * Số phút đi trễ vẫn được ghi lại và hiển thị cho quản lý theo dõi,
 * nhưng KHÔNG bị trừ vào lương.
 *******************************************************/

function tinhLuongThang_(thang, chiMaNV) {
  const k = khoangThang_(thang);
  const dsCa = mapCa_();
  const nvMap = mapNhanVien_();
  const luongGioMD = getCfgNum_('luongGioMacDinh', 25000);
  const phuCapMD = getCfgNum_('phuCapCaMacDinh', 0);
  const nguong = getCfgNum_('nguongPhutTinhPhuCap', 240);
  const treChoPhep = getCfgNum_('phutTreChoPhep', 5);
  const loc = chiMaNV ? String(chiMaNV).trim().toUpperCase() : '';

  const kq = {};
  function slot(maNV) {
    const ma = String(maNV).trim().toUpperCase();
    if (!kq[ma]) {
      const nv = nvMap[ma];
      kq[ma] = {
        maNV: ma, hoTen: nv ? String(nv.hoTen || '') : ma,
        chucVu: nv ? String(nv.chucVu || '') : '',
        trangThaiNV: nv ? String(nv.trangThai || '') : 'KhongTonTai',
        luongTheoGio: nv ? (num_(nv.luongTheoGio) || luongGioMD) : luongGioMD,
        phuCapCa: nv ? (num_(nv.phuCapCa) || phuCapMD) : phuCapMD,
        soCa: 0, tongPhutLam: 0, tongPhutTre: 0, soLanTre: 0, soCaThieuGio: 0,
        luongCa: 0, phuCap: 0, thuong: 0, phat: 0,
        chiTiet: [], thuongPhat: []
      };
    }
    return kq[ma];
  }

  // 1. Từ chấm công
  readAll_(SHEETS.CHAMCONG).forEach(r => {
    if (String(r.trangThai).trim() !== 'HoanThanh') return;
    if (!trongKhoang_(r.ngay, k.tu, k.den)) return;
    const ma = String(r.maNV).trim().toUpperCase();
    if (loc && ma !== loc) return;

    const s = slot(ma);
    const ca = dsCa[String(r.maCa).trim().toUpperCase()];
    const phut = num_(r.soPhutLam);
    const tre = num_(r.soPhutTre);

    const tienCa = Math.round((phut / 60) * s.luongTheoGio);
    const duPhuCap = phut >= nguong;
    const pc = duPhuCap ? s.phuCapCa : 0;

    s.soCa++;
    s.tongPhutLam += phut;
    s.tongPhutTre += tre;
    if (tre > treChoPhep) s.soLanTre++;   // chỉ để thống kê, không trừ tiền
    if (!duPhuCap) s.soCaThieuGio++;
    s.luongCa += tienCa;
    s.phuCap += pc;

    s.chiTiet.push({
      ngay: dstr_(r.ngay), maCa: String(r.maCa || ''),
      tenCa: ca ? ca.tenCa : String(r.maCa || ''),
      gioVao: tstr_(r.gioVao), gioRa: tstr_(r.gioRa),
      soPhutLam: phut, gio: Math.round(phut / 6) / 10,
      soPhutTre: tre,
      tienCa: tienCa, phuCap: pc,
      thanhTien: tienCa + pc
    });
  });

  // 2. Thưởng / phạt thủ công
  readAll_(SHEETS.THUONGPHAT).forEach(r => {
    if (String(r.thang).slice(0, 7) !== k.thang) return;
    const ma = String(r.maNV).trim().toUpperCase();
    if (loc && ma !== loc) return;
    const s = slot(ma);
    const tien = num_(r.soTien);
    const laThuong = String(r.loai).trim() === 'Thuong';
    if (laThuong) s.thuong += tien; else s.phat += tien;
    s.thuongPhat.push({
      id: String(r.id), loai: laThuong ? 'Thuong' : 'Phat',
      soTien: tien, lyDo: String(r.lyDo || ''), thoiGian: String(r.thoiGian || '')
    });
  });

  // 3. Nhân viên đang làm nhưng chưa có công trong tháng => vẫn hiện với số 0
  if (!loc) {
    Object.keys(nvMap).forEach(ma => {
      if (String(nvMap[ma].trangThai).trim() === 'DangLam') slot(ma);
    });
  } else if (nvMap[loc]) {
    slot(loc);
  }

  // 4. Trạng thái chốt lương
  const daChot = {};
  readAll_(SHEETS.BANGLUONG).forEach(r => {
    if (String(r.thang).slice(0, 7) === k.thang) daChot[String(r.maNV).trim().toUpperCase()] = String(r.trangThai || '');
  });

  const ds = Object.keys(kq).map(ma => {
    const s = kq[ma];
    s.tongGio = Math.round(s.tongPhutLam / 6) / 10;
    s.thucNhan = Math.round(s.luongCa + s.phuCap + s.thuong - s.phat);
    s.daChot = daChot[ma] || '';
    s.chiTiet.sort((a, b) => a.ngay.localeCompare(b.ngay) || a.gioVao.localeCompare(b.gioVao));
    return s;
  }).sort((a, b) => b.thucNhan - a.thucNhan || a.hoTen.localeCompare(b.hoTen));

  return { thang: k.thang, tu: k.tu, den: k.den, danhSach: ds };
}

/** Nhân viên xem lương của chính mình. */
function luongCuaToi_(nv, p) {
  const r = tinhLuongThang_(p.thang, nv.maNV);
  const me = r.danhSach[0] || null;
  return {
    thang: r.thang, tu: r.tu, den: r.den,
    luong: me,
    congThuc: {
      luongTheoGio: me ? me.luongTheoGio : 0,
      phuCapCa: me ? me.phuCapCa : 0,
      nguongPhutTinhPhuCap: getCfgNum_('nguongPhutTinhPhuCap', 240),
      phutTreChoPhep: getCfgNum_('phutTreChoPhep', 5)
    }
  };
}
