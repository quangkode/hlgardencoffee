/*******************************************************
 * ApiKho.gs — Kiểm kho cuối ca
 *
 * Mỗi lần kiểm tạo N dòng trong sheet KiemKho (1 dòng / mặt hàng),
 * cùng chung 1 mã phiếu ở cột id.
 *   tonTruoc  = số thực tế của lần kiểm gần nhất
 *   haoHut    = tonTruoc + nhapThem - thucTe   (đã dùng / hao / thất thoát)
 *******************************************************/

function khoDanhMuc_() {
  return readAll_(SHEETS.HANG)
    .filter(r => String(r.trangThai || 'HoatDong').trim() === 'HoatDong')
    .map(r => ({
      maHang: String(r.maHang).trim(), tenHang: String(r.tenHang || ''),
      donVi: String(r.donVi || ''), nhomHang: String(r.nhomHang || 'Khác'),
      tonDinhMuc: num_(r.tonDinhMuc), giaVon: num_(r.giaVon)
    }));
}

/** Tồn ghi nhận gần nhất của từng mặt hàng. */
function tonGanNhat_() {
  const map = {};
  readAll_(SHEETS.KIEMKHO).forEach(r => {
    const ma = String(r.maHang).trim();
    const stamp = String(r.thoiGian || '');
    if (!map[ma] || stamp >= map[ma].stamp) {
      map[ma] = { stamp: stamp, thucTe: num_(r.thucTe) };
    }
  });
  return map;
}

/** Tạo phiếu kiểm kho trống, điền sẵn tồn kỳ trước. */
function khoPhieuMoi_(nv, p) {
  const dm = khoDanhMuc_();
  const ton = tonGanNhat_();
  const nhom = {};
  dm.forEach(h => {
    const t = ton[h.maHang];
    h.tonTruoc = t ? t.thucTe : 0;
    h.lanKiemTruoc = t ? t.stamp : '';
    if (!nhom[h.nhomHang]) nhom[h.nhomHang] = [];
    nhom[h.nhomHang].push(h);
  });
  return {
    ngay: today_(),
    dsCa: caDanhSach_(),
    maCaGoiY: caGoiYHienTai_(nv),
    nhomHang: Object.keys(nhom).map(k => ({ ten: k, items: nhom[k] }))
  };
}

/** Đoán ca hiện tại của nhân viên (đang chấm công / gần giờ nhất). */
function caGoiYHienTai_(nv) {
  const mo = banGhiDangMo_(nv.maNV);
  if (mo) return String(mo.maCa || '');
  const dsCa = mapCa_();
  const phut = phutTuChuoi_(nowTime_());
  let best = '', bestD = 99999;
  Object.keys(dsCa).forEach(k => {
    const c = dsCa[k];
    if (c.trangThai !== 'HoatDong') return;
    const giua = (c.phutBatDau + c.phutKetThuc) / 2;
    const d = Math.abs(lechPhut_(phut, giua % 1440));
    if (d < bestD) { bestD = d; best = c.maCa; }
  });
  return best;
}

function khoGui_(nv, p) {
  const items = Array.isArray(p.items) ? p.items : [];
  if (!items.length) throw new Error('Chưa nhập số liệu mặt hàng nào.');

  const dm = {};
  khoDanhMuc_().forEach(h => { dm[h.maHang] = h; });
  const ton = tonGanNhat_();
  const id = uid_('KK');
  const stamp = nowStamp_();
  const ngay = today_();
  const maCa = String(p.maCa || caGoiYHienTai_(nv)).trim().toUpperCase();

  const rows = [];
  const canhBao = [];
  items.forEach(it => {
    const ma = String(it.maHang || '').trim();
    const h = dm[ma];
    if (!h) return;
    if (it.thucTe === '' || it.thucTe === null || it.thucTe === undefined) return; // bỏ trống = không kiểm

    const tonTruoc = (ton[ma] ? ton[ma].thucTe : 0);
    const nhap = num_(it.nhapThem);
    const thucTe = num_(it.thucTe);
    const hao = Math.round((tonTruoc + nhap - thucTe) * 1000) / 1000;
    const duoi = h.tonDinhMuc > 0 && thucTe < h.tonDinhMuc;
    if (duoi) canhBao.push(h.tenHang + ' còn ' + thucTe + ' ' + h.donVi + ' (định mức ' + h.tonDinhMuc + ')');

    rows.push({
      id: id, thoiGian: stamp, ngay: ngay, maCa: maCa,
      maNV: nv.maNV, hoTen: nv.hoTen,
      maHang: ma, tenHang: h.tenHang, donVi: h.donVi,
      tonTruoc: tonTruoc, nhapThem: nhap, thucTe: thucTe, haoHut: hao,
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
    canhBao: canhBao
  };
}

/** Gom các dòng KiemKho thành phiếu. */
function gomPhieuKho_(rows) {
  const map = {};
  rows.forEach(r => {
    const id = String(r.id);
    if (!map[id]) {
      map[id] = {
        id: id, thoiGian: String(r.thoiGian || ''), ngay: dstr_(r.ngay),
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
  return Object.keys(map).map(k => map[k])
    .sort((a, b) => b.thoiGian.localeCompare(a.thoiGian));
}

function khoLichSu_(nv, p) {
  const tu = dstr_(p.tuNgay) || Utilities.formatDate(new Date(Date.now() - 7 * 86400000), TZ, 'yyyy-MM-dd');
  const den = dstr_(p.denNgay) || today_();
  const rows = readAll_(SHEETS.KIEMKHO).filter(r => trongKhoang_(r.ngay, tu, den));
  return { tu: tu, den: den, phieu: gomPhieuKho_(rows).slice(0, 60) };
}
