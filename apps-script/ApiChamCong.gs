/*******************************************************
 * ApiChamCong.gs — Chấm công vào/ra (nhân viên)
 *******************************************************/

/** Chênh lệch phút, chuẩn hoá về khoảng [-720, 720) để xử lý ca qua đêm. */
function lechPhut_(thucTe, moc) {
  let d = thucTe - moc;
  while (d < -720) d += 1440;
  while (d >= 720) d -= 1440;
  return d;
}

/** Bản ghi chấm công đang mở của nhân viên (hôm nay hoặc hôm qua cho ca đêm). */
function banGhiDangMo_(maNV, rows) {
  const dsRows = rows || readAll_(SHEETS.CHAMCONG);
  const homNay = today_();
  const homQua = Utilities.formatDate(new Date(Date.now() - 86400000), TZ, 'yyyy-MM-dd');
  const ma = String(maNV).trim().toUpperCase();
  let kq = null;
  dsRows.forEach(r => {
    if (String(r.maNV).trim().toUpperCase() !== ma) return;
    if (String(r.trangThai).trim() !== 'DangLam') return;
    const ngay = dstr_(r.ngay);
    if (ngay === homNay || ngay === homQua) {
      if (!kq || ngay + tstr_(r.gioVao) > dstr_(kq.ngay) + tstr_(kq.gioVao)) kq = r;
    }
  });
  return kq;
}

/** Kiểm tra vị trí GPS so với toạ độ quán. */
function kiemTraViTri_(lat, lng) {
  const batBuoc = getCfgBool_('batBuocViTri', true);
  const banKinh = getCfgNum_('banKinhChamCong', 0);
  const latQ = getCfg_('latQuan', ''), lngQ = getCfg_('lngQuan', '');

  const coToaDoQuan = latQ !== '' && lngQ !== '';
  const coToaDoNV = lat !== undefined && lat !== null && lat !== '' &&
                    lng !== undefined && lng !== null && lng !== '';

  if (!coToaDoNV) {
    if (batBuoc && coToaDoQuan && banKinh > 0) {
      throw new Error('Không lấy được vị trí. Bật GPS / cho phép truy cập vị trí rồi thử lại.');
    }
    return { viTri: '', khoangCach: '', ngoaiVung: false };
  }

  const viTri = num_(lat).toFixed(6) + ',' + num_(lng).toFixed(6);
  if (!coToaDoQuan || banKinh <= 0) {
    return { viTri: viTri, khoangCach: '', ngoaiVung: false };
  }

  const d = khoangCach_(num_(lat), num_(lng), num_(latQ), num_(lngQ));
  const ngoai = d > banKinh;
  if (ngoai && getCfgBool_('chanNgoaiVung', false)) {
    throw new Error('Bạn đang cách quán ' + d + 'm (cho phép ' + banKinh + 'm). Đến quán rồi chấm công nhé.');
  }
  return { viTri: viTri, khoangCach: d, ngoaiVung: ngoai };
}

/** Lịch ca đã được duyệt của nhân viên trong ngày. */
function lichDaDuyet_(maNV, ngay) {
  const ma = String(maNV).trim().toUpperCase();
  return readAll_(SHEETS.LICH).filter(r =>
    String(r.maNV).trim().toUpperCase() === ma &&
    dstr_(r.ngay) === ngay &&
    ['DaDuyet', 'DuocXep'].indexOf(String(r.trangThai).trim()) >= 0
  );
}

/* ---------------- API ---------------- */

function ccTrangThai_(nv) {
  const rows = readAll_(SHEETS.CHAMCONG);
  const dsCa = mapCa_();
  const homNay = today_();
  const mo = banGhiDangMo_(nv.maNV, rows);

  const hienTai = mo ? {
    id: mo.id,
    ngay: dstr_(mo.ngay),
    maCa: String(mo.maCa || ''),
    tenCa: dsCa[String(mo.maCa).toUpperCase()] ? dsCa[String(mo.maCa).toUpperCase()].tenCa : '',
    gioVao: tstr_(mo.gioVao),
    soPhutTre: num_(mo.soPhutTre),
    ngoaiVung: bool_(mo.ngoaiVung)
  } : null;

  // Ca hôm nay của tôi
  const lich = lichDaDuyet_(nv.maNV, homNay).map(r => {
    const c = dsCa[String(r.maCa).toUpperCase()];
    return {
      maCa: String(r.maCa), tenCa: c ? c.tenCa : String(r.maCa),
      gioBatDau: c ? c.gioBatDau : '', gioKetThuc: c ? c.gioKetThuc : ''
    };
  });

  // Bản ghi hôm nay đã hoàn thành
  const ma = String(nv.maNV).trim().toUpperCase();
  const homNayXong = rows.filter(r =>
    String(r.maNV).trim().toUpperCase() === ma &&
    dstr_(r.ngay) === homNay &&
    String(r.trangThai).trim() === 'HoanThanh'
  ).map(r => ({
    maCa: String(r.maCa || ''), gioVao: tstr_(r.gioVao), gioRa: tstr_(r.gioRa),
    soPhutLam: num_(r.soPhutLam), soPhutTre: num_(r.soPhutTre)
  }));

  // Thống kê nhanh tháng này
  const k = khoangThang_(thangHienTai_());
  let phut = 0, soCa = 0, treCa = 0;
  rows.forEach(r => {
    if (String(r.maNV).trim().toUpperCase() !== ma) return;
    if (String(r.trangThai).trim() !== 'HoanThanh') return;
    if (!trongKhoang_(r.ngay, k.tu, k.den)) return;
    phut += num_(r.soPhutLam); soCa++;
    if (num_(r.soPhutTre) > getCfgNum_('phutTreChoPhep', 5)) treCa++;
  });

  return {
    serverTime: nowStamp_(),
    homNay: homNay,
    dangLam: !!mo,
    hienTai: hienTai,
    caHomNay: lich,
    daLamHomNay: homNayXong,
    dsCa: Object.keys(dsCa).filter(k2 => dsCa[k2].trangThai === 'HoatDong').map(k2 => ({
      maCa: dsCa[k2].maCa, tenCa: dsCa[k2].tenCa,
      gioBatDau: dsCa[k2].gioBatDau, gioKetThuc: dsCa[k2].gioKetThuc
    })),
    thongKeThang: {
      thang: k.thang, tongPhut: phut, tongGio: Math.round(phut / 6) / 10,
      soCa: soCa, soLanTre: treCa
    }
  };
}

function ccVao_(nv, p) {
  return withLock_(() => {
    const rows = readAll_(SHEETS.CHAMCONG);
    if (banGhiDangMo_(nv.maNV, rows)) {
      throw new Error('Bạn đang trong ca. Hãy chấm công RA trước đã.');
    }

    const homNay = today_();
    const gio = nowTime_();
    const phutHienTai = phutTuChuoi_(gio);
    const dsCa = mapCa_();

    let maCa = String(p.maCa || '').trim().toUpperCase();
    const lich = lichDaDuyet_(nv.maNV, homNay);

    // Không chọn ca => tự đoán theo lịch đã duyệt, hoặc ca gần giờ hiện tại nhất
    if (!maCa) {
      if (lich.length === 1) {
        maCa = String(lich[0].maCa).trim().toUpperCase();
      } else {
        let best = null, bestD = 99999;
        Object.keys(dsCa).forEach(k => {
          const c = dsCa[k];
          if (c.trangThai !== 'HoatDong') return;
          const d = Math.abs(lechPhut_(phutHienTai, c.phutBatDau));
          if (d < bestD) { bestD = d; best = c.maCa; }
        });
        maCa = best || '';
      }
    }
    const ca = dsCa[maCa];
    if (!ca) throw new Error('Chưa chọn ca làm việc.');

    // Đã làm xong ca này hôm nay rồi?
    const ma = String(nv.maNV).trim().toUpperCase();
    const trung = rows.filter(r =>
      String(r.maNV).trim().toUpperCase() === ma &&
      dstr_(r.ngay) === homNay &&
      String(r.maCa).trim().toUpperCase() === maCa &&
      String(r.trangThai).trim() === 'HoanThanh'
    );
    if (trung.length) throw new Error('Hôm nay bạn đã hoàn thành ' + ca.tenCa + ' rồi.');

    const vt = kiemTraViTri_(p.lat, p.lng);
    const tre = Math.max(0, lechPhut_(phutHienTai, ca.phutBatDau % 1440));
    const ngoaiLich = lich.filter(r => String(r.maCa).trim().toUpperCase() === maCa).length === 0;

    let anh = '';
    if (p.anh) anh = luuAnh_(p.anh, 'VAO_' + nv.maNV + '_' + homNay + '_' + gio.replace(':', ''));
    else if (getCfgBool_('yeuCauAnh', false)) throw new Error('Cài đặt quán yêu cầu chụp ảnh khi chấm công.');

    const rec = {
      id: uid_('CC'),
      maNV: nv.maNV, hoTen: nv.hoTen,
      ngay: homNay, maCa: maCa,
      gioVao: gio, gioRa: '',
      soPhutLam: '', soPhutTre: tre, soPhutVeSom: '',
      trangThai: 'DangLam',
      viTriVao: vt.viTri, khoangCachVao: vt.khoangCach,
      viTriRa: '', khoangCachRa: '',
      ngoaiVung: vt.ngoaiVung ? 'TRUE' : 'FALSE',
      ngoaiLich: ngoaiLich ? 'TRUE' : 'FALSE',
      anhVao: anh, anhRa: '',
      ghiChu: String(p.ghiChu || ''), nguoiSua: '', thoiGianSua: ''
    };
    appendObj_(SHEETS.CHAMCONG, rec);
    ghiNhatKy_(nv, 'ChamCongVao', maCa + ' lúc ' + gio + (tre > 0 ? ' (trễ ' + tre + "')" : ''));

    return {
      thongBao: 'Đã chấm công vào ' + ca.tenCa + ' lúc ' + gio +
                (tre > getCfgNum_('phutTreChoPhep', 5) ? ' — trễ ' + tre + ' phút' : ''),
      trangThai: ccTrangThai_(nv)
    };
  });
}

function ccRa_(nv, p) {
  return withLock_(() => {
    const rows = readAll_(SHEETS.CHAMCONG);
    const mo = banGhiDangMo_(nv.maNV, rows);
    if (!mo) throw new Error('Bạn chưa chấm công vào.');

    const dsCa = mapCa_();
    const ca = dsCa[String(mo.maCa).trim().toUpperCase()];
    const gioRa = nowTime_();
    const phutRa = phutTuChuoi_(gioRa);
    const phutVao = phutTuChuoi_(tstr_(mo.gioVao));

    let lam = phutRa - phutVao;
    if (dstr_(mo.ngay) !== today_() || lam < 0) lam += 1440; // qua đêm
    if (lam <= 0) throw new Error('Thời gian làm không hợp lệ. Báo quản lý sửa giúp.');
    if (lam > 1080) throw new Error('Ca vượt 18 tiếng — có vẻ bạn quên chấm ra hôm trước. Báo quản lý xử lý.');

    const nghi = ca ? ca.soPhutNghi : 0;
    const phutLam = lamTron_(Math.max(0, lam - nghi));
    const veSom = ca ? Math.max(0, lechPhut_(ca.phutKetThuc % 1440, phutRa)) : 0;

    const vt = kiemTraViTri_(p.lat, p.lng);
    let anh = '';
    if (p.anh) anh = luuAnh_(p.anh, 'RA_' + nv.maNV + '_' + today_() + '_' + gioRa.replace(':', ''));

    const ghiChuCu = String(mo.ghiChu || '');
    const ghiChuMoi = String(p.ghiChu || '');

    patchRow_(SHEETS.CHAMCONG, mo._row, {
      gioRa: gioRa,
      soPhutLam: phutLam,
      soPhutVeSom: veSom,
      trangThai: 'HoanThanh',
      viTriRa: vt.viTri,
      khoangCachRa: vt.khoangCach,
      ngoaiVung: (bool_(mo.ngoaiVung) || vt.ngoaiVung) ? 'TRUE' : 'FALSE',
      anhRa: anh,
      ghiChu: [ghiChuCu, ghiChuMoi].filter(String).join(' | ')
    });

    ghiNhatKy_(nv, 'ChamCongRa', mo.maCa + ' lúc ' + gioRa + ' — ' + phutLam + ' phút');

    const gio = Math.floor(phutLam / 60), ph = phutLam % 60;
    return {
      thongBao: 'Đã chấm công ra lúc ' + gioRa + '. Ca này bạn làm ' +
                (gio ? gio + ' giờ ' : '') + ph + ' phút.' +
                (veSom > 5 ? ' (về sớm ' + veSom + ' phút)' : ''),
      trangThai: ccTrangThai_(nv)
    };
  });
}

function ccLichSu_(nv, p) {
  const k = p.thang ? khoangThang_(p.thang) : { tu: p.tuNgay || '', den: p.denNgay || '' };
  const ma = String(nv.maNV).trim().toUpperCase();
  const dsCa = mapCa_();

  const ds = readAll_(SHEETS.CHAMCONG)
    .filter(r => String(r.maNV).trim().toUpperCase() === ma && trongKhoang_(r.ngay, k.tu, k.den))
    .map(r => {
      const c = dsCa[String(r.maCa).trim().toUpperCase()];
      return {
        id: r.id, ngay: dstr_(r.ngay), maCa: String(r.maCa || ''),
        tenCa: c ? c.tenCa : String(r.maCa || ''),
        gioVao: tstr_(r.gioVao), gioRa: tstr_(r.gioRa),
        soPhutLam: num_(r.soPhutLam), soPhutTre: num_(r.soPhutTre), soPhutVeSom: num_(r.soPhutVeSom),
        trangThai: String(r.trangThai || ''), ngoaiVung: bool_(r.ngoaiVung),
        ngoaiLich: bool_(r.ngoaiLich), ghiChu: String(r.ghiChu || ''),
        daSua: !!String(r.nguoiSua || '')
      };
    })
    .sort((a, b) => (b.ngay + b.gioVao).localeCompare(a.ngay + a.gioVao));

  return { tu: k.tu, den: k.den, danhSach: ds };
}
