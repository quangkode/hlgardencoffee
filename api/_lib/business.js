/*******************************************************
 * business.js — Toàn bộ nghiệp vụ: chấm công, báo ca, kho, giao ca, lương
 *
 * Chuyển gần như nguyên vẹn từ bản Apps Script. Chạy đồng bộ trên bản sao
 * dữ liệu đã nạp sẵn trong bộ nhớ, nên không có await nào ở đây cả.
 *******************************************************/

import {
  SHEETS, readAll_, appendObj_, appendMany_, patchRow_, writeRow_, deleteRow_, findBy_,
  num_, bool_, dstr_, tstr_, pad2_, uid_,
  today_, nowTime_, nowStamp_, thangHienTai_, ngayLech_, dinhDangNgay_, now_,
  phutTuChuoi_, khoangThang_, trongKhoang_, khoangCach_,
  getCfg_, getCfgNum_, getCfgBool_, setCfgNhieu_, ghiNhatKy_
} from './core.js';
import {
  taoNhanVien_, taoHashPin_, hoSoCongKhai_, laQuanLy_, batBuocQuanLy_,
  cauHinhChoClient_, doiPin_
} from './auth.js';

/* Apps Script có LockService, môi trường serverless thì không. Việc thêm dòng
   qua Sheets API vốn đã nguyên tử, còn sửa/xoá theo chỉ số dòng chỉ do quản lý
   thực hiện nên xác suất giẫm chân nhau gần như không có với quy mô một quán. */
function withLock_(fn) { return fn(); }

/* ================= Tra cứu chung ================= */

export function mapNhanVien_() {
  const m = {};
  readAll_(SHEETS.NHANVIEN).forEach(r => { m[String(r.maNV).trim().toUpperCase()] = r; });
  return m;
}

export function mapCa_() {
  const m = {};
  readAll_(SHEETS.CA).forEach(r => {
    const bd = phutTuChuoi_(tstr_(r.gioBatDau));
    let kt = phutTuChuoi_(tstr_(r.gioKetThuc));
    if (kt >= 0 && bd >= 0 && kt <= bd) kt += 1440;      // ca qua đêm
    m[String(r.maCa).trim().toUpperCase()] = {
      maCa: String(r.maCa).trim().toUpperCase(),
      tenCa: r.tenCa,
      gioBatDau: tstr_(r.gioBatDau),
      gioKetThuc: tstr_(r.gioKetThuc),
      phutBatDau: bd,
      phutKetThuc: kt,
      soPhutNghi: num_(r.soPhutNghi),
      trangThai: String(r.trangThai || 'HoatDong').trim(),
      _row: r._row
    };
  });
  return m;
}

function lamTron_(phut) {
  const b = getCfgNum_('lamTronPhut', 0);
  if (!b || b <= 1) return Math.round(phut);
  return Math.round(phut / b) * b;
}

/** Chênh lệch phút, chuẩn hoá về [-720, 720) để xử lý ca qua đêm. */
export function lechPhut_(thucTe, moc) {
  let d = thucTe - moc;
  while (d < -720) d += 1440;
  while (d >= 720) d -= 1440;
  return d;
}

/* ================= CHẤM CÔNG ================= */

export function banGhiDangMo_(maNV, rows) {
  const ds = rows || readAll_(SHEETS.CHAMCONG);
  const homNay = today_();
  const homQua = ngayLech_(-1);
  const ma = String(maNV).trim().toUpperCase();
  let kq = null;
  ds.forEach(r => {
    if (String(r.maNV).trim().toUpperCase() !== ma) return;
    if (String(r.trangThai).trim() !== 'DangLam') return;
    const ngay = dstr_(r.ngay);
    if (ngay === homNay || ngay === homQua) {
      if (!kq || ngay + tstr_(r.gioVao) > dstr_(kq.ngay) + tstr_(kq.gioVao)) kq = r;
    }
  });
  return kq;
}

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
  if (!coToaDoQuan || banKinh <= 0) return { viTri, khoangCach: '', ngoaiVung: false };

  const d = khoangCach_(num_(lat), num_(lng), num_(latQ), num_(lngQ));
  const ngoai = d > banKinh;
  if (ngoai && getCfgBool_('chanNgoaiVung', false)) {
    throw new Error('Bạn đang cách quán ' + d + 'm (cho phép ' + banKinh + 'm). Đến quán rồi chấm công nhé.');
  }
  return { viTri, khoangCach: d, ngoaiVung: ngoai };
}

function lichDaDuyet_(maNV, ngay) {
  const ma = String(maNV).trim().toUpperCase();
  return readAll_(SHEETS.LICH).filter(r =>
    String(r.maNV).trim().toUpperCase() === ma &&
    dstr_(r.ngay) === ngay &&
    ['DaDuyet', 'DuocXep'].includes(String(r.trangThai).trim())
  );
}

export function ccTrangThai_(nv) {
  const rows = readAll_(SHEETS.CHAMCONG);
  const dsCa = mapCa_();
  const homNay = today_();
  const mo = banGhiDangMo_(nv.maNV, rows);

  const hienTai = mo ? {
    id: mo.id,
    ngay: dstr_(mo.ngay),
    maCa: String(mo.maCa || ''),
    tenCa: dsCa[String(mo.maCa).toUpperCase()]?.tenCa || '',
    gioVao: tstr_(mo.gioVao),
    soPhutTre: num_(mo.soPhutTre),
    ngoaiVung: bool_(mo.ngoaiVung)
  } : null;

  const lich = lichDaDuyet_(nv.maNV, homNay).map(r => {
    const c = dsCa[String(r.maCa).toUpperCase()];
    return {
      maCa: String(r.maCa), tenCa: c ? c.tenCa : String(r.maCa),
      gioBatDau: c ? c.gioBatDau : '', gioKetThuc: c ? c.gioKetThuc : ''
    };
  });

  const ma = String(nv.maNV).trim().toUpperCase();
  const daLamHomNay = rows
    .filter(r => String(r.maNV).trim().toUpperCase() === ma &&
                 dstr_(r.ngay) === homNay &&
                 String(r.trangThai).trim() === 'HoanThanh')
    .map(r => ({
      maCa: String(r.maCa || ''), gioVao: tstr_(r.gioVao), gioRa: tstr_(r.gioRa),
      soPhutLam: num_(r.soPhutLam), soPhutTre: num_(r.soPhutTre)
    }));

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
    homNay,
    dangLam: !!mo,
    hienTai,
    caHomNay: lich,
    daLamHomNay,
    dsCa: Object.values(dsCa)
      .filter(c => c.trangThai === 'HoatDong')
      .map(c => ({ maCa: c.maCa, tenCa: c.tenCa, gioBatDau: c.gioBatDau, gioKetThuc: c.gioKetThuc })),
    thongKeThang: {
      thang: k.thang, tongPhut: phut, tongGio: Math.round(phut / 6) / 10,
      soCa, soLanTre: treCa
    }
  };
}

export function ccVao_(nv, p) {
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

    if (!maCa) {
      if (lich.length === 1) {
        maCa = String(lich[0].maCa).trim().toUpperCase();
      } else {
        let best = null, bestD = 99999;
        Object.values(dsCa).forEach(c => {
          if (c.trangThai !== 'HoatDong') return;
          const d = Math.abs(lechPhut_(phutHienTai, c.phutBatDau));
          if (d < bestD) { bestD = d; best = c.maCa; }
        });
        maCa = best || '';
      }
    }
    const ca = dsCa[maCa];
    if (!ca) throw new Error('Chưa chọn ca làm việc.');

    const ma = String(nv.maNV).trim().toUpperCase();
    const trung = rows.some(r =>
      String(r.maNV).trim().toUpperCase() === ma &&
      dstr_(r.ngay) === homNay &&
      String(r.maCa).trim().toUpperCase() === maCa &&
      String(r.trangThai).trim() === 'HoanThanh');
    if (trung) throw new Error('Hôm nay bạn đã hoàn thành ' + ca.tenCa + ' rồi.');

    const vt = kiemTraViTri_(p.lat, p.lng);
    const tre = Math.max(0, lechPhut_(phutHienTai, ca.phutBatDau % 1440));
    const ngoaiLich = !lich.some(r => String(r.maCa).trim().toUpperCase() === maCa);

    appendObj_(SHEETS.CHAMCONG, {
      id: uid_('CC'),
      maNV: nv.maNV, hoTen: nv.hoTen,
      ngay: homNay, maCa,
      gioVao: gio, gioRa: '',
      soPhutLam: '', soPhutTre: tre, soPhutVeSom: '',
      trangThai: 'DangLam',
      viTriVao: vt.viTri, khoangCachVao: vt.khoangCach,
      viTriRa: '', khoangCachRa: '',
      ngoaiVung: vt.ngoaiVung ? 'TRUE' : 'FALSE',
      ngoaiLich: ngoaiLich ? 'TRUE' : 'FALSE',
      anhVao: '', anhRa: '',
      ghiChu: String(p.ghiChu || ''), nguoiSua: '', thoiGianSua: ''
    });
    ghiNhatKy_(nv, 'ChamCongVao', maCa + ' lúc ' + gio + (tre > 0 ? ' (trễ ' + tre + "')" : ''));

    return {
      thongBao: 'Đã chấm công vào ' + ca.tenCa + ' lúc ' + gio +
                (tre > getCfgNum_('phutTreChoPhep', 5) ? ' — trễ ' + tre + ' phút' : ''),
      trangThai: ccTrangThai_(nv)
    };
  });
}

export function ccRa_(nv, p) {
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
    if (dstr_(mo.ngay) !== today_() || lam < 0) lam += 1440;
    if (lam <= 0) throw new Error('Thời gian làm không hợp lệ. Báo quản lý sửa giúp.');
    if (lam > 1080) throw new Error('Ca vượt 18 tiếng — có vẻ bạn quên chấm ra hôm trước. Báo quản lý xử lý.');

    const phutLam = lamTron_(Math.max(0, lam - (ca ? ca.soPhutNghi : 0)));
    const veSom = ca ? Math.max(0, lechPhut_(ca.phutKetThuc % 1440, phutRa)) : 0;
    const vt = kiemTraViTri_(p.lat, p.lng);

    patchRow_(SHEETS.CHAMCONG, mo._row, {
      gioRa,
      soPhutLam: phutLam,
      soPhutVeSom: veSom,
      trangThai: 'HoanThanh',
      viTriRa: vt.viTri,
      khoangCachRa: vt.khoangCach,
      ngoaiVung: (bool_(mo.ngoaiVung) || vt.ngoaiVung) ? 'TRUE' : 'FALSE',
      ghiChu: [String(mo.ghiChu || ''), String(p.ghiChu || '')].filter(Boolean).join(' | ')
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

export function ccLichSu_(nv, p) {
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

/* ================= BÁO CA / LỊCH LÀM VIỆC ================= */

export function caDanhSach_() {
  return Object.values(mapCa_())
    .filter(c => c.trangThai === 'HoatDong')
    .map(c => ({
      maCa: c.maCa, tenCa: c.tenCa, gioBatDau: c.gioBatDau,
      gioKetThuc: c.gioKetThuc, soPhutNghi: c.soPhutNghi, trangThai: c.trangThai
    }));
}

export function caCuaToi_(nv, p) {
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
      const maCa = String(r.maCa).trim().toUpperCase();
      const c = dsCa[maCa];
      const ngay = dstr_(r.ngay);
      return {
        id: r.id, ngay, maCa,
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

export function caBaoCa_(nv, p) {
  if (!getCfgBool_('choPhepTuDangKyCa', true)) {
    throw new Error('Quản lý đang tắt tính năng tự báo ca. Liên hệ quản lý để được xếp ca.');
  }
  const items = Array.isArray(p.items) ? p.items : [{ ngay: p.ngay, maCa: p.maCa, ghiChu: p.ghiChu }];
  if (!items.length) throw new Error('Chưa chọn ca nào.');

  const dsCa = mapCa_();
  const han = getCfgNum_('hanBaoCaTruoc', 1);
  const hanNgay = ngayLech_(han);

  return withLock_(() => {
    const ma = String(nv.maNV).trim().toUpperCase();
    const daCo = new Set();
    readAll_(SHEETS.LICH).forEach(r => {
      if (String(r.maNV).trim().toUpperCase() !== ma) return;
      if (['Huy', 'TuChoi'].includes(String(r.trangThai).trim())) return;
      daCo.add(dstr_(r.ngay) + '|' + String(r.maCa).trim().toUpperCase());
    });

    const them = [], boQua = [];
    items.forEach(it => {
      const ngay = dstr_(it.ngay);
      const maCa = String(it.maCa || '').trim().toUpperCase();
      if (!ngay || !maCa) return;
      if (!dsCa[maCa]) { boQua.push(ngay + ' ' + maCa + ' (ca không tồn tại)'); return; }
      if (ngay < hanNgay) {
        boQua.push(ngay + ' ' + dsCa[maCa].tenCa + ' (phải báo trước ' + han + ' ngày)');
        return;
      }
      if (daCo.has(ngay + '|' + maCa)) { boQua.push(ngay + ' ' + dsCa[maCa].tenCa + ' (đã báo rồi)'); return; }
      daCo.add(ngay + '|' + maCa);
      them.push({
        id: uid_('LC'), maNV: nv.maNV, hoTen: nv.hoTen,
        ngay, maCa, trangThai: 'ChoDuyet',
        ghiChuNV: String(it.ghiChu || p.ghiChu || ''), ghiChuQL: '',
        nguoiTao: nv.maNV, thoiGianTao: nowStamp_(), nguoiDuyet: '', thoiGianDuyet: ''
      });
    });

    if (!them.length) throw new Error('Không báo được ca nào.\n• ' + boQua.join('\n• '));
    appendMany_(SHEETS.LICH, them);
    ghiNhatKy_(nv, 'BaoCa', them.map(t => t.ngay + ' ' + t.maCa).join(', '));

    return {
      thongBao: 'Đã gửi ' + them.length + ' ca, chờ quản lý duyệt.' +
                (boQua.length ? '\nBỏ qua: ' + boQua.join('; ') : ''),
      soCa: them.length
    };
  });
}

export function caHuyBaoCa_(nv, p) {
  const r = findBy_(SHEETS.LICH, 'id', p.id);
  if (!r) throw new Error('Không tìm thấy ca này.');
  if (String(r.maNV).trim().toUpperCase() !== String(nv.maNV).trim().toUpperCase()) {
    throw new Error('Đây không phải ca của bạn.');
  }
  const tt = String(r.trangThai).trim();
  if (tt === 'Huy') throw new Error('Ca này đã huỷ rồi.');
  if ((tt === 'DaDuyet' || tt === 'DuocXep') && dstr_(r.ngay) <= today_()) {
    throw new Error('Ca đã duyệt và đến hạn — báo trực tiếp quản lý nhé.');
  }
  patchRow_(SHEETS.LICH, r._row, {
    trangThai: 'Huy',
    ghiChuNV: [String(r.ghiChuNV || ''), 'NV huỷ ' + nowStamp_()].filter(Boolean).join(' | ')
  });
  ghiNhatKy_(nv, 'HuyBaoCa', dstr_(r.ngay) + ' ' + r.maCa);
  return { thongBao: 'Đã huỷ ca ' + dstr_(r.ngay) + '.' };
}

/* ================= KIỂM KHO ================= */

export function khoDanhMuc_() {
  return readAll_(SHEETS.HANG)
    .filter(r => String(r.trangThai || 'HoatDong').trim() === 'HoatDong')
    .map(r => ({
      maHang: String(r.maHang).trim(), tenHang: String(r.tenHang || ''),
      donVi: String(r.donVi || ''), nhomHang: String(r.nhomHang || 'Khác'),
      tonDinhMuc: num_(r.tonDinhMuc), giaVon: num_(r.giaVon)
    }));
}

export function tonGanNhat_() {
  const map = {};
  readAll_(SHEETS.KIEMKHO).forEach(r => {
    const ma = String(r.maHang).trim();
    const stamp = String(r.thoiGian || '');
    if (!map[ma] || stamp >= map[ma].stamp) map[ma] = { stamp, thucTe: num_(r.thucTe) };
  });
  return map;
}

export function caGoiYHienTai_(nv) {
  const mo = banGhiDangMo_(nv.maNV);
  if (mo) return String(mo.maCa || '');
  const phut = phutTuChuoi_(nowTime_());
  let best = '', bestD = 99999;
  Object.values(mapCa_()).forEach(c => {
    if (c.trangThai !== 'HoatDong') return;
    const giua = (c.phutBatDau + c.phutKetThuc) / 2;
    const d = Math.abs(lechPhut_(phut, giua % 1440));
    if (d < bestD) { bestD = d; best = c.maCa; }
  });
  return best;
}

export function khoPhieuMoi_(nv) {
  const ton = tonGanNhat_();
  const nhom = {};
  khoDanhMuc_().forEach(h => {
    const t = ton[h.maHang];
    h.tonTruoc = t ? t.thucTe : 0;
    h.lanKiemTruoc = t ? t.stamp : '';
    (nhom[h.nhomHang] = nhom[h.nhomHang] || []).push(h);
  });
  return {
    ngay: today_(),
    dsCa: caDanhSach_(),
    maCaGoiY: caGoiYHienTai_(nv),
    nhomHang: Object.keys(nhom).map(k => ({ ten: k, items: nhom[k] }))
  };
}

export function khoGui_(nv, p) {
  const items = Array.isArray(p.items) ? p.items : [];
  if (!items.length) throw new Error('Chưa nhập số liệu mặt hàng nào.');

  const dm = {};
  khoDanhMuc_().forEach(h => { dm[h.maHang] = h; });
  const ton = tonGanNhat_();
  const id = uid_('KK');
  const stamp = nowStamp_();
  const ngay = today_();
  const maCa = String(p.maCa || caGoiYHienTai_(nv)).trim().toUpperCase();

  const rows = [], canhBao = [];
  items.forEach(it => {
    const ma = String(it.maHang || '').trim();
    const h = dm[ma];
    if (!h) return;
    if (it.thucTe === '' || it.thucTe === null || it.thucTe === undefined) return;

    const tonTruoc = ton[ma] ? ton[ma].thucTe : 0;
    const nhap = num_(it.nhapThem);
    const thucTe = num_(it.thucTe);
    const hao = Math.round((tonTruoc + nhap - thucTe) * 1000) / 1000;
    const duoi = h.tonDinhMuc > 0 && thucTe < h.tonDinhMuc;
    if (duoi) canhBao.push(h.tenHang + ' còn ' + thucTe + ' ' + h.donVi + ' (định mức ' + h.tonDinhMuc + ')');

    rows.push({
      id, thoiGian: stamp, ngay, maCa,
      maNV: nv.maNV, hoTen: nv.hoTen,
      maHang: ma, tenHang: h.tenHang, donVi: h.donVi,
      tonTruoc, nhapThem: nhap, thucTe, haoHut: hao,
      duoiDinhMuc: duoi ? 'TRUE' : 'FALSE',
      ghiChu: String(it.ghiChu || '')
    });
  });

  if (!rows.length) throw new Error('Chưa nhập số thực tế cho mặt hàng nào.');
  withLock_(() => appendMany_(SHEETS.KIEMKHO, rows));
  ghiNhatKy_(nv, 'KiemKho', id + ' — ' + rows.length + ' mặt hàng');

  return {
    thongBao: 'Đã gửi phiếu kiểm kho ' + rows.length + ' mặt hàng.',
    maPhieu: id,
    canhBao
  };
}

export function gomPhieuKho_(rows) {
  const map = {};
  rows.forEach(r => {
    const id = String(r.id);
    if (!map[id]) {
      map[id] = {
        id, thoiGian: String(r.thoiGian || ''), ngay: dstr_(r.ngay),
        maCa: String(r.maCa || ''), maNV: String(r.maNV || ''), hoTen: String(r.hoTen || ''),
        soMatHang: 0, soCanhBao: 0, items: []
      };
    }
    const duoi = bool_(r.duoiDinhMuc);
    map[id].soMatHang++;
    if (duoi) map[id].soCanhBao++;
    map[id].items.push({
      maHang: String(r.maHang), tenHang: String(r.tenHang || ''), donVi: String(r.donVi || ''),
      tonTruoc: num_(r.tonTruoc), nhapThem: num_(r.nhapThem), thucTe: num_(r.thucTe),
      haoHut: num_(r.haoHut), duoiDinhMuc: duoi, ghiChu: String(r.ghiChu || '')
    });
  });
  return Object.values(map).sort((a, b) => b.thoiGian.localeCompare(a.thoiGian));
}

export function khoLichSu_(nv, p) {
  const tu = dstr_(p.tuNgay) || ngayLech_(-7);
  const den = dstr_(p.denNgay) || today_();
  const rows = readAll_(SHEETS.KIEMKHO).filter(r => trongKhoang_(r.ngay, tu, den));
  return { tu, den, phieu: gomPhieuKho_(rows).slice(0, 60) };
}

/* ================= GIAO CA ================= */

export function gcDanhSachNguoiNhan_(nv) {
  const ma = String(nv.maNV).trim().toUpperCase();
  return readAll_(SHEETS.NHANVIEN)
    .filter(r => String(r.trangThai).trim() === 'DangLam' && String(r.maNV).trim().toUpperCase() !== ma)
    .map(r => ({ maNV: String(r.maNV).trim(), hoTen: String(r.hoTen || ''), chucVu: String(r.chucVu || '') }));
}

function dinhDangTien_(n) {
  return String(Math.round(num_(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
}

export function gcGui_(nv, p) {
  const maCa = String(p.maCa || caGoiYHienTai_(nv)).trim().toUpperCase();
  if (!maCa) throw new Error('Chưa chọn ca.');

  const nvMap = mapNhanVien_();
  const maNhan = String(p.maNVNhan || '').trim().toUpperCase();
  if (maNhan && !nvMap[maNhan]) throw new Error('Người nhận ca không hợp lệ.');
  if (maNhan && maNhan === String(nv.maNV).trim().toUpperCase()) {
    throw new Error('Không thể giao ca cho chính mình.');
  }

  const tienDauCa = num_(p.tienDauCa);
  const tienMatCuoiCa = num_(p.tienMatCuoiCa);
  const tienChuyenKhoan = num_(p.tienChuyenKhoan);
  const tongDoanhThu = num_(p.tongDoanhThu);
  const kyVong = tienDauCa + (tongDoanhThu - tienChuyenKhoan);
  const chenh = Math.round(tienMatCuoiCa - kyVong);

  const rec = {
    id: uid_('GC'), thoiGian: nowStamp_(), ngay: today_(), maCa,
    maNVGiao: nv.maNV, tenNVGiao: nv.hoTen,
    maNVNhan: maNhan, tenNVNhan: maNhan ? nvMap[maNhan].hoTen : '',
    tienDauCa, tienMatCuoiCa, tienChuyenKhoan, tongDoanhThu,
    soHoaDon: num_(p.soHoaDon), tienNopVe: num_(p.tienNopVe), chenhLech: chenh,
    tinhTrangThietBi: String(p.tinhTrangThietBi || 'Bình thường'),
    vanDe: String(p.vanDe || ''), ghiChu: String(p.ghiChu || ''),
    trangThai: maNhan ? 'ChoXacNhan' : 'DaXacNhan',
    thoiGianXacNhan: maNhan ? '' : nowStamp_()
  };

  withLock_(() => appendObj_(SHEETS.GIAOCA, rec));
  ghiNhatKy_(nv, 'GiaoCa', maCa + ' — doanh thu ' + tongDoanhThu + ', lệch ' + chenh);

  let tb = 'Đã gửi biên bản giao ca.';
  if (maNhan) tb += ' Chờ ' + nvMap[maNhan].hoTen + ' xác nhận.';
  if (chenh !== 0) tb += ' Quỹ tiền mặt ' + (chenh > 0 ? 'dư ' : 'thiếu ') + dinhDangTien_(Math.abs(chenh)) + '.';

  return { thongBao: tb, chenhLech: chenh, id: rec.id };
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

export function gcDanhSach_(nv, p) {
  const tu = dstr_(p.tuNgay) || ngayLech_(-7);
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

  return { tu, den, danhSach: ds.slice(0, 100) };
}

export function gcChoToiXacNhan_(nv) {
  const ma = String(nv.maNV).trim().toUpperCase();
  return {
    danhSach: readAll_(SHEETS.GIAOCA)
      .filter(r => String(r.maNVNhan).trim().toUpperCase() === ma &&
                   String(r.trangThai).trim() === 'ChoXacNhan')
      .map(mapGiaoCa_)
  };
}

export function gcXacNhan_(nv, p) {
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
      .filter(Boolean).join(' | ')
  });
  ghiNhatKy_(nv, 'XacNhanGiaoCa', String(r.id));
  return { thongBao: 'Đã xác nhận nhận ca.' };
}

/* ================= LƯƠNG =================
 * Mọi ca tính như nhau: giờ công × lương/giờ. Không hệ số, không phạt trễ.
 * Số phút trễ vẫn thống kê để quản lý theo dõi, nhưng không trừ tiền.
 */

export function tinhLuongThang_(thang, chiMaNV) {
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
    if (tre > treChoPhep) s.soLanTre++;
    if (!duPhuCap) s.soCaThieuGio++;
    s.luongCa += tienCa;
    s.phuCap += pc;

    s.chiTiet.push({
      ngay: dstr_(r.ngay), maCa: String(r.maCa || ''),
      tenCa: ca ? ca.tenCa : String(r.maCa || ''),
      gioVao: tstr_(r.gioVao), gioRa: tstr_(r.gioRa),
      soPhutLam: phut, gio: Math.round(phut / 6) / 10,
      soPhutTre: tre, tienCa, phuCap: pc, thanhTien: tienCa + pc
    });
  });

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

  if (!loc) {
    Object.keys(nvMap).forEach(ma => {
      if (String(nvMap[ma].trangThai).trim() === 'DangLam') slot(ma);
    });
  } else if (nvMap[loc]) {
    slot(loc);
  }

  const daChot = {};
  readAll_(SHEETS.BANGLUONG).forEach(r => {
    if (String(r.thang).slice(0, 7) === k.thang) {
      daChot[String(r.maNV).trim().toUpperCase()] = String(r.trangThai || '');
    }
  });

  const ds = Object.values(kq).map(s => {
    s.tongGio = Math.round(s.tongPhutLam / 6) / 10;
    s.thucNhan = Math.round(s.luongCa + s.phuCap + s.thuong - s.phat);
    s.daChot = daChot[s.maNV] || '';
    s.chiTiet.sort((a, b) => a.ngay.localeCompare(b.ngay) || a.gioVao.localeCompare(b.gioVao));
    return s;
  }).sort((a, b) => b.thucNhan - a.thucNhan || a.hoTen.localeCompare(b.hoTen));

  return { thang: k.thang, tu: k.tu, den: k.den, danhSach: ds };
}

export function luongCuaToi_(nv, p) {
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

/* ================= QUẢN LÝ: TỔNG QUAN ================= */

export function qlTongQuan_(nv, p) {
  const homNay = dstr_(p.ngay) || today_();
  const homQua = ngayLech_(-1);
  const dsCa = mapCa_();
  const cc = readAll_(SHEETS.CHAMCONG);

  let dangLam = 0, caHomNay = 0, phutHomNay = 0, treHomNay = 0, ngoaiVung = 0, quenRa = 0;
  const danhSachHomNay = [];

  cc.forEach(r => {
    const ngay = dstr_(r.ngay);
    if (String(r.trangThai).trim() === 'DangLam') {
      // Ca mở từ trước hôm qua là ca bỏ quên, không phải người đang đứng quán.
      if (ngay < homQua) quenRa++; else dangLam++;
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
      ngoaiLich: bool_(r.ngoaiLich), ghiChu: String(r.ghiChu || '')
    });
  });

  const choDuyet = readAll_(SHEETS.LICH).filter(r => String(r.trangThai).trim() === 'ChoDuyet').length;

  const gc = readAll_(SHEETS.GIAOCA);
  const choXacNhan = gc.filter(r => String(r.trangThai).trim() === 'ChoXacNhan').length;
  let doanhThuHomNay = 0, lechQuyHomNay = 0, soBienBanHomNay = 0;
  gc.forEach(r => {
    if (dstr_(r.ngay) !== homNay) return;
    soBienBanHomNay++;
    doanhThuHomNay += num_(r.tongDoanhThu);
    lechQuyHomNay += num_(r.chenhLech);
  });

  const ton = tonGanNhat_();
  const cbKho = [];
  khoDanhMuc_().forEach(h => {
    if (h.tonDinhMuc <= 0) return;
    const t = ton[h.maHang];
    if (t && t.thucTe < h.tonDinhMuc) {
      cbKho.push({ tenHang: h.tenHang, con: t.thucTe, donVi: h.donVi, dinhMuc: h.tonDinhMuc });
    }
  });

  const soNV = readAll_(SHEETS.NHANVIEN).filter(r => String(r.trangThai).trim() === 'DangLam').length;
  const luong = tinhLuongThang_(thangHienTai_());
  const tongLuong = luong.danhSach.reduce((s, x) => s + x.thucNhan, 0);

  return {
    ngay: homNay, serverTime: nowStamp_(),
    soNhanVien: soNV,
    dangLam, quenChamRa: quenRa,
    caHomNay, gioHomNay: Math.round(phutHomNay / 6) / 10,
    treHomNay, ngoaiVung,
    caChoDuyet: choDuyet, giaoCaChoXacNhan: choXacNhan,
    doanhThuHomNay, lechQuyHomNay, soBienBanHomNay,
    canhBaoKho: cbKho.slice(0, 12), soCanhBaoKho: cbKho.length,
    thangHienTai: luong.thang, tongLuongTamTinh: tongLuong,
    danhSachHomNay: danhSachHomNay.sort((a, b) => (b.gioVao || '').localeCompare(a.gioVao || ''))
  };
}

export function qlDangTrongCa_() {
  const dsCa = mapCa_();
  const homNay = today_();
  const homQua = ngayLech_(-1);
  const ds = readAll_(SHEETS.CHAMCONG)
    .filter(r => String(r.trangThai).trim() === 'DangLam')
    .map(r => {
      const c = dsCa[String(r.maCa).trim().toUpperCase()];
      const ngay = dstr_(r.ngay);
      let daLam = phutTuChuoi_(nowTime_()) - phutTuChuoi_(tstr_(r.gioVao));
      if (ngay !== homNay || daLam < 0) daLam += 1440;
      return {
        id: String(r.id), maNV: String(r.maNV), hoTen: String(r.hoTen || ''),
        ngay, maCa: String(r.maCa || ''), tenCa: c ? c.tenCa : '',
        gioVao: tstr_(r.gioVao), daLamPhut: daLam, boQuen: ngay < homQua,
        soPhutTre: num_(r.soPhutTre), ngoaiVung: bool_(r.ngoaiVung)
      };
    })
    .sort((a, b) => (a.ngay + a.gioVao).localeCompare(b.ngay + b.gioVao));
  return { serverTime: nowStamp_(), danhSach: ds };
}

/* ================= QUẢN LÝ: NHÂN VIÊN ================= */

export function qlDsNhanVien_() {
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

export function qlLuuNhanVien_(nv, p) {
  const ma = String(p.maNV || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,20}$/.test(ma)) {
    throw new Error('Mã nhân viên chỉ gồm chữ/số, 2–20 ký tự (vd: NV002).');
  }
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
      if (String(p.chucVu).trim() !== 'QuanLy') {
        throw new Error('Không thể tự bỏ quyền quản lý của chính mình.');
      }
      if (String(p.trangThai || 'DangLam').trim() !== 'DangLam') {
        throw new Error('Không thể tự khoá tài khoản của chính mình.');
      }
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

export function qlResetPin_(nv, p) {
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

/* ================= QUẢN LÝ: CHẤM CÔNG ================= */

function tinhLaiChamCong_(maCa, gioVao, gioRa) {
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

export function qlChamCong_(nv, p) {
  const k = p.thang ? khoangThang_(p.thang) : {
    tu: dstr_(p.tuNgay) || ngayLech_(-14),
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
        ghiChu: String(r.ghiChu || ''), nguoiSua: String(r.nguoiSua || '')
      };
    })
    .sort((a, b) => (b.ngay + b.gioVao).localeCompare(a.ngay + a.gioVao));

  const tongPhut = ds.reduce((s, r) => s + r.soPhutLam, 0);
  return {
    tu: k.tu, den: k.den, danhSach: ds,
    tong: { soCa: ds.length, tongGio: Math.round(tongPhut / 6) / 10 }
  };
}

export function qlSuaChamCong_(nv, p) {
  const r = findBy_(SHEETS.CHAMCONG, 'id', p.id);
  if (!r) throw new Error('Không tìm thấy bản ghi chấm công.');

  const ngay = dstr_(p.ngay) || dstr_(r.ngay);
  const maCa = String(p.maCa || r.maCa).trim().toUpperCase();
  const gioVao = tstr_(p.gioVao !== undefined ? p.gioVao : r.gioVao);
  const gioRa = tstr_(p.gioRa !== undefined ? p.gioRa : r.gioRa);

  const tinh = tinhLaiChamCong_(maCa, gioVao, gioRa);
  patchRow_(SHEETS.CHAMCONG, r._row, {
    ngay, maCa, gioVao, gioRa,
    soPhutLam: tinh.soPhutLam, soPhutTre: tinh.soPhutTre, soPhutVeSom: tinh.soPhutVeSom,
    trangThai: tinh.trangThai,
    ghiChu: String(p.ghiChu !== undefined ? p.ghiChu : (r.ghiChu || '')),
    nguoiSua: nv.maNV, thoiGianSua: nowStamp_()
  });
  ghiNhatKy_(nv, 'SuaChamCong', p.id + ' -> ' + ngay + ' ' + gioVao + '-' + gioRa);
  return { thongBao: 'Đã cập nhật công của ' + r.hoTen + ' ngày ' + ngay + '.' };
}

export function qlThemChamCong_(nv, p) {
  const ma = String(p.maNV || '').trim().toUpperCase();
  const nvT = findBy_(SHEETS.NHANVIEN, 'maNV', ma);
  if (!nvT) throw new Error('Không tìm thấy nhân viên.');
  const ngay = dstr_(p.ngay);
  if (!ngay) throw new Error('Chưa chọn ngày.');
  const maCa = String(p.maCa || '').trim().toUpperCase();
  if (!mapCa_()[maCa]) throw new Error('Chưa chọn ca.');

  const tinh = tinhLaiChamCong_(maCa, tstr_(p.gioVao), tstr_(p.gioRa));
  withLock_(() => appendObj_(SHEETS.CHAMCONG, {
    id: uid_('CC'), maNV: ma, hoTen: nvT.hoTen, ngay, maCa,
    gioVao: tstr_(p.gioVao), gioRa: tstr_(p.gioRa),
    soPhutLam: tinh.soPhutLam, soPhutTre: tinh.soPhutTre, soPhutVeSom: tinh.soPhutVeSom,
    trangThai: tinh.trangThai,
    viTriVao: '', khoangCachVao: '', viTriRa: '', khoangCachRa: '',
    ngoaiVung: 'FALSE', ngoaiLich: 'FALSE', anhVao: '', anhRa: '',
    ghiChu: String(p.ghiChu || 'Quản lý nhập tay'),
    nguoiSua: nv.maNV, thoiGianSua: nowStamp_()
  }));
  ghiNhatKy_(nv, 'ThemChamCong', ma + ' ' + ngay + ' ' + maCa);
  return { thongBao: 'Đã thêm công cho ' + nvT.hoTen + ' ngày ' + ngay + '.' };
}

export function qlXoaChamCong_(nv, p) {
  const r = findBy_(SHEETS.CHAMCONG, 'id', p.id);
  if (!r) throw new Error('Không tìm thấy bản ghi.');
  deleteRow_(SHEETS.CHAMCONG, r._row);
  ghiNhatKy_(nv, 'XoaChamCong', p.id + ' (' + r.maNV + ' ' + dstr_(r.ngay) + ')');
  return { thongBao: 'Đã xoá bản ghi chấm công.' };
}

/* ================= QUẢN LÝ: LỊCH CA ================= */

export function qlLichCa_(nv, p) {
  const tu = dstr_(p.tuNgay) || today_();
  const den = dstr_(p.denNgay) || ngayLech_(13);
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
    tu, den, danhSach: ds, dsCa: caDanhSach_(),
    dsNhanVien: readAll_(SHEETS.NHANVIEN)
      .filter(r => String(r.trangThai).trim() === 'DangLam')
      .map(r => ({ maNV: String(r.maNV).trim(), hoTen: String(r.hoTen || '') }))
  };
}

export function qlDuyetCa_(nv, p) {
  const ids = Array.isArray(p.ids) ? p.ids : [p.id];
  const duyet = !!p.duyet;
  const rows = readAll_(SHEETS.LICH);
  let n = 0;
  ids.forEach(id => {
    const r = rows.find(x => String(x.id) === String(id));
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

export function qlXepCa_(nv, p) {
  const items = Array.isArray(p.items) ? p.items : [{ maNV: p.maNV, ngay: p.ngay, maCa: p.maCa }];
  const nvMap = mapNhanVien_();
  const dsCa = mapCa_();

  return withLock_(() => {
    const daCo = new Set();
    readAll_(SHEETS.LICH).forEach(r => {
      if (['Huy', 'TuChoi'].includes(String(r.trangThai).trim())) return;
      daCo.add(String(r.maNV).trim().toUpperCase() + '|' + dstr_(r.ngay) + '|' +
               String(r.maCa).trim().toUpperCase());
    });

    const them = [];
    items.forEach(it => {
      const ma = String(it.maNV || '').trim().toUpperCase();
      const ngay = dstr_(it.ngay);
      const maCa = String(it.maCa || '').trim().toUpperCase();
      if (!nvMap[ma] || !ngay || !dsCa[maCa]) return;
      const key = ma + '|' + ngay + '|' + maCa;
      if (daCo.has(key)) return;
      daCo.add(key);
      them.push({
        id: uid_('LC'), maNV: ma, hoTen: nvMap[ma].hoTen, ngay, maCa,
        trangThai: 'DuocXep', ghiChuNV: '', ghiChuQL: String(p.ghiChu || ''),
        nguoiTao: nv.maNV, thoiGianTao: nowStamp_(),
        nguoiDuyet: nv.maNV, thoiGianDuyet: nowStamp_()
      });
    });

    if (!them.length) throw new Error('Không xếp được ca nào (trùng lịch hoặc dữ liệu không hợp lệ).');
    appendMany_(SHEETS.LICH, them);
    ghiNhatKy_(nv, 'XepCa', them.map(t => t.maNV + ' ' + t.ngay + ' ' + t.maCa).join(', '));
    return { thongBao: 'Đã xếp ' + them.length + ' ca.' };
  });
}

export function qlXoaLichCa_(nv, p) {
  const r = findBy_(SHEETS.LICH, 'id', p.id);
  if (!r) throw new Error('Không tìm thấy ca.');
  deleteRow_(SHEETS.LICH, r._row);
  ghiNhatKy_(nv, 'XoaLichCa', p.id);
  return { thongBao: 'Đã xoá ca khỏi lịch.' };
}

export function qlLuuCa_(nv, p) {
  const ma = String(p.maCa || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,10}$/.test(ma)) throw new Error('Mã ca chỉ gồm chữ/số, 2–10 ký tự (vd: CA1).');
  if (phutTuChuoi_(tstr_(p.gioBatDau)) < 0) throw new Error('Giờ bắt đầu không hợp lệ (HH:mm).');
  if (phutTuChuoi_(tstr_(p.gioKetThuc)) < 0) throw new Error('Giờ kết thúc không hợp lệ (HH:mm).');

  const obj = {
    maCa: ma, tenCa: String(p.tenCa || ma).trim(),
    gioBatDau: tstr_(p.gioBatDau), gioKetThuc: tstr_(p.gioKetThuc),
    soPhutNghi: num_(p.soPhutNghi),
    trangThai: String(p.trangThai || 'HoatDong').trim(), ghiChu: String(p.ghiChu || '')
  };
  const cu = findBy_(SHEETS.CA, 'maCa', ma);
  if (cu) writeRow_(SHEETS.CA, cu._row, obj); else appendObj_(SHEETS.CA, obj);
  ghiNhatKy_(nv, 'LuuCa', ma);
  return { thongBao: 'Đã lưu ca ' + obj.tenCa + '.' };
}

/* ================= QUẢN LÝ: LƯƠNG ================= */

export function qlBangLuong_(nv, p) {
  const r = tinhLuongThang_(p.thang, p.maNV);
  const tong = { soNV: r.danhSach.length, tongGio: 0, tongLuong: 0, tongThuong: 0, tongPhat: 0, soCa: 0 };
  r.danhSach.forEach(x => {
    tong.tongGio += x.tongGio; tong.tongLuong += x.thucNhan;
    tong.tongThuong += x.thuong; tong.tongPhat += x.phat; tong.soCa += x.soCa;
  });
  tong.tongGio = Math.round(tong.tongGio * 10) / 10;
  r.tong = tong;
  return r;
}

export function qlChotLuong_(nv, p) {
  const r = tinhLuongThang_(p.thang);
  const k = khoangThang_(p.thang);

  return withLock_(() => {
    readAll_(SHEETS.BANGLUONG)
      .filter(x => String(x.thang).slice(0, 7) === k.thang)
      .sort((a, b) => b._row - a._row)
      .forEach(x => deleteRow_(SHEETS.BANGLUONG, x._row));

    const stamp = nowStamp_();
    const rows = r.danhSach.map(x => ({
      id: uid_('BL'), thang: k.thang, maNV: x.maNV, hoTen: x.hoTen,
      soCa: x.soCa, tongPhutLam: x.tongPhutLam, tongGio: x.tongGio,
      luongTheoGio: x.luongTheoGio, luongCa: x.luongCa, phuCap: x.phuCap,
      thuong: x.thuong, phat: x.phat, soLanTre: x.soLanTre, thucNhan: x.thucNhan,
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

export function qlThuongPhat_(nv, p) {
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
  return { thang, danhSach: ds };
}

export function qlLuuThuongPhat_(nv, p) {
  const ma = String(p.maNV || '').trim().toUpperCase();
  const nvT = findBy_(SHEETS.NHANVIEN, 'maNV', ma);
  if (!nvT) throw new Error('Chưa chọn nhân viên.');
  const tien = num_(p.soTien);
  if (tien <= 0) throw new Error('Số tiền phải lớn hơn 0.');

  const loai = String(p.loai).trim() === 'Phat' ? 'Phat' : 'Thuong';
  const thang = khoangThang_(p.thang).thang;
  const rec = {
    id: p.id || uid_('TP'), thang, maNV: ma, hoTen: nvT.hoTen,
    loai, soTien: tien, lyDo: String(p.lyDo || ''),
    nguoiTao: nv.maNV, thoiGian: nowStamp_()
  };
  const cu = p.id ? findBy_(SHEETS.THUONGPHAT, 'id', p.id) : null;
  if (cu) writeRow_(SHEETS.THUONGPHAT, cu._row, rec); else appendObj_(SHEETS.THUONGPHAT, rec);
  ghiNhatKy_(nv, 'ThuongPhat', loai + ' ' + ma + ' ' + tien);
  return { thongBao: 'Đã lưu ' + (loai === 'Thuong' ? 'thưởng' : 'phạt') + ' cho ' + nvT.hoTen + '.' };
}

export function qlXoaThuongPhat_(nv, p) {
  const r = findBy_(SHEETS.THUONGPHAT, 'id', p.id);
  if (!r) throw new Error('Không tìm thấy mục này.');
  deleteRow_(SHEETS.THUONGPHAT, r._row);
  ghiNhatKy_(nv, 'XoaThuongPhat', p.id);
  return { thongBao: 'Đã xoá.' };
}

/* ================= QUẢN LÝ: KHO ================= */

export function qlKho_(nv, p) {
  const tu = dstr_(p.tuNgay) || ngayLech_(-7);
  const den = dstr_(p.denNgay) || today_();
  const rows = readAll_(SHEETS.KIEMKHO).filter(r => trongKhoang_(r.ngay, tu, den));

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

  const thongKe = Object.values(theoHang).map(x => {
    x.tongHao = Math.round(x.tongHao * 1000) / 1000;
    x.tienHao = Math.round(x.tongHao * x.giaVon);
    x.duoiDinhMuc = x.tonDinhMuc > 0 && x.tonHienTai < x.tonDinhMuc;
    return x;
  }).sort((a, b) => b.tienHao - a.tienHao);

  return {
    tu, den,
    phieu: gomPhieuKho_(rows).slice(0, 60),
    thongKe,
    danhMuc: readAll_(SHEETS.HANG).map(r => ({
      maHang: String(r.maHang).trim(), tenHang: String(r.tenHang || ''), donVi: String(r.donVi || ''),
      nhomHang: String(r.nhomHang || ''), tonDinhMuc: num_(r.tonDinhMuc), giaVon: num_(r.giaVon),
      trangThai: String(r.trangThai || 'HoatDong').trim()
    }))
  };
}

export function qlLuuHang_(nv, p) {
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

/* ================= QUẢN LÝ: GIAO CA & CÀI ĐẶT ================= */

export function qlGiaoCa_(nv, p) {
  const r = gcDanhSach_(nv, p);
  const tong = { soBienBan: r.danhSach.length, doanhThu: 0, chenhLech: 0, tienMat: 0, chuyenKhoan: 0, soHoaDon: 0 };
  r.danhSach.forEach(x => {
    tong.doanhThu += x.tongDoanhThu; tong.chenhLech += x.chenhLech;
    tong.tienMat += x.tienMatCuoiCa; tong.chuyenKhoan += x.tienChuyenKhoan;
    tong.soHoaDon += x.soHoaDon;
  });
  r.tong = tong;
  return r;
}

export function qlDocCaiDat_() {
  return {
    caiDat: readAll_(SHEETS.CAIDAT).map(r => ({
      key: String(r.key).trim(),
      value: String(r.value == null ? '' : r.value),
      moTa: String(r.moTa || '')
    })),
    linkSheet: 'https://docs.google.com/spreadsheets/d/' + (process.env.GOOGLE_SHEET_ID || '') + '/edit',
    dsCa: readAll_(SHEETS.CA).map(r => ({
      maCa: String(r.maCa).trim(), tenCa: String(r.tenCa || ''),
      gioBatDau: tstr_(r.gioBatDau), gioKetThuc: tstr_(r.gioKetThuc),
      soPhutNghi: num_(r.soPhutNghi),
      trangThai: String(r.trangThai || 'HoatDong').trim(), ghiChu: String(r.ghiChu || '')
    }))
  };
}

export function qlLuuCaiDat_(nv, p) {
  const data = p.caiDat || {};
  const n = setCfgNhieu_(data);
  ghiNhatKy_(nv, 'LuuCaiDat', Object.keys(data).join(','));
  return { thongBao: 'Đã lưu ' + n + ' cài đặt.', cauHinh: cauHinhChoClient_() };
}

/* Dùng lại từ auth để router gọi được qua một chỗ */
export { doiPin_, hoSoCongKhai_, cauHinhChoClient_, batBuocQuanLy_ };
