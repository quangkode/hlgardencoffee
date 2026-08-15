/*******************************************************
 * api/index.js — Cổng API duy nhất
 *
 * Client gọi POST /api  với { token, action, payload }.
 * Mỗi lượt gọi: nạp đúng những sheet cần → chạy nghiệp vụ đồng bộ trên
 * bộ nhớ → ghi ngược mọi thay đổi một lượt. Thường chỉ 1–2 vòng mạng.
 *******************************************************/

import {
  SHEETS, napDb_, chayVoiDb_, taoSheetConThieu_, bool_, nowStamp_, getCfg_, laLoiHeThong_
} from './_lib/core.js';
import { login_, xacThuc_ } from './_lib/auth.js';
import { seed_, SHEET_CAN_CHO_SETUP } from './_lib/setup.js';
import * as B from './_lib/business.js';

/* Sheet mà mọi thao tác đều đụng tới: nhân viên (xác thực), cài đặt, nhật ký */
const NEN = [SHEETS.NHANVIEN, SHEETS.CAIDAT, SHEETS.NHATKY];

const CC = SHEETS.CHAMCONG, CA = SHEETS.CA, LICH = SHEETS.LICH;
const KHO = SHEETS.KIEMKHO, HANG = SHEETS.HANG, GC = SHEETS.GIAOCA;
const TP = SHEETS.THUONGPHAT, BL = SHEETS.BANGLUONG;

const LUONG = [CC, CA, TP, BL];

/**
 * Bảng thao tác. `sheets` là các sheet cần nạp thêm ngoài NEN.
 * `cong` = ai cũng gọi được (chưa đăng nhập). `ql` = chỉ quản lý.
 */
const THAO_TAC = {
  'appInfo':       { cong: true, sheets: [], fn: () => ({ tenQuan: getCfg_('tenQuan', 'Quán Cà Phê'), serverTime: nowStamp_() }) },
  'login':         { cong: true, sheets: [], fn: (nv, p) => login_(p) },

  'me':            { sheets: [], fn: nv => ({ me: B.hoSoCongKhai_(nv), cauHinh: B.cauHinhChoClient_() }) },
  'doiPin':        { sheets: [], fn: (nv, p) => B.doiPin_(nv, p) },

  'cc.trangThai':  { sheets: [CC, CA, LICH], fn: nv => B.ccTrangThai_(nv) },
  'cc.vao':        { sheets: [CC, CA, LICH], fn: (nv, p) => B.ccVao_(nv, p) },
  'cc.ra':         { sheets: [CC, CA, LICH], fn: (nv, p) => B.ccRa_(nv, p) },
  'cc.lichSu':     { sheets: [CC, CA],       fn: (nv, p) => B.ccLichSu_(nv, p) },

  'ca.danhSachCa': { sheets: [CA],             fn: () => B.caDanhSach_() },
  'ca.cuaToi':     { sheets: [CA, LICH, CC],   fn: (nv, p) => B.caCuaToi_(nv, p) },
  'ca.baoCa':      { sheets: [CA, LICH],       fn: (nv, p) => B.caBaoCa_(nv, p) },
  'ca.huyBaoCa':   { sheets: [LICH],           fn: (nv, p) => B.caHuyBaoCa_(nv, p) },

  'luong.cuaToi':  { sheets: LUONG, fn: (nv, p) => B.luongCuaToi_(nv, p) },

  'kho.danhMuc':   { sheets: [HANG],                fn: () => B.khoDanhMuc_() },
  'kho.phieuMoi':  { sheets: [HANG, KHO, CA, CC],   fn: nv => B.khoPhieuMoi_(nv) },
  'kho.gui':       { sheets: [HANG, KHO, CA, CC],   fn: (nv, p) => B.khoGui_(nv, p) },
  'kho.lichSu':    { sheets: [KHO],                 fn: (nv, p) => B.khoLichSu_(nv, p) },

  'gc.dsNguoiNhan':   { sheets: [],           fn: nv => B.gcDanhSachNguoiNhan_(nv) },
  'gc.gui':           { sheets: [GC, CA, CC], fn: (nv, p) => B.gcGui_(nv, p) },
  'gc.danhSach':      { sheets: [GC],         fn: (nv, p) => B.gcDanhSach_(nv, p) },
  'gc.xacNhan':       { sheets: [GC],         fn: (nv, p) => B.gcXacNhan_(nv, p) },
  'gc.choToiXacNhan': { sheets: [GC],         fn: nv => B.gcChoToiXacNhan_(nv) },

  'ql.tongQuan':     { ql: true, sheets: [CC, CA, LICH, GC, HANG, KHO, TP, BL], fn: (nv, p) => B.qlTongQuan_(nv, p) },
  'ql.dangTrongCa':  { ql: true, sheets: [CC, CA],  fn: () => B.qlDangTrongCa_() },

  'ql.dsNhanVien':   { ql: true, sheets: [], fn: () => B.qlDsNhanVien_() },
  'ql.luuNhanVien':  { ql: true, sheets: [], fn: (nv, p) => B.qlLuuNhanVien_(nv, p) },
  'ql.resetPin':     { ql: true, sheets: [], fn: (nv, p) => B.qlResetPin_(nv, p) },

  'ql.chamCong':     { ql: true, sheets: [CC, CA], fn: (nv, p) => B.qlChamCong_(nv, p) },
  'ql.suaChamCong':  { ql: true, sheets: [CC, CA], fn: (nv, p) => B.qlSuaChamCong_(nv, p) },
  'ql.themChamCong': { ql: true, sheets: [CC, CA], fn: (nv, p) => B.qlThemChamCong_(nv, p) },
  'ql.xoaChamCong':  { ql: true, sheets: [CC],     fn: (nv, p) => B.qlXoaChamCong_(nv, p) },

  'ql.lichCa':       { ql: true, sheets: [LICH, CA], fn: (nv, p) => B.qlLichCa_(nv, p) },
  'ql.duyetCa':      { ql: true, sheets: [LICH],     fn: (nv, p) => B.qlDuyetCa_(nv, p) },
  'ql.xepCa':        { ql: true, sheets: [LICH, CA], fn: (nv, p) => B.qlXepCa_(nv, p) },
  'ql.xoaLichCa':    { ql: true, sheets: [LICH],     fn: (nv, p) => B.qlXoaLichCa_(nv, p) },
  'ql.luuCa':        { ql: true, sheets: [CA],       fn: (nv, p) => B.qlLuuCa_(nv, p) },

  'ql.bangLuong':    { ql: true, sheets: LUONG, fn: (nv, p) => B.qlBangLuong_(nv, p) },
  'ql.chotLuong':    { ql: true, sheets: LUONG, fn: (nv, p) => B.qlChotLuong_(nv, p) },
  'ql.thuongPhat':    { ql: true, sheets: [TP], fn: (nv, p) => B.qlThuongPhat_(nv, p) },
  'ql.luuThuongPhat': { ql: true, sheets: [TP], fn: (nv, p) => B.qlLuuThuongPhat_(nv, p) },
  'ql.xoaThuongPhat': { ql: true, sheets: [TP], fn: (nv, p) => B.qlXoaThuongPhat_(nv, p) },

  'ql.kho':      { ql: true, sheets: [KHO, HANG], fn: (nv, p) => B.qlKho_(nv, p) },
  'ql.luuHang':  { ql: true, sheets: [HANG],      fn: (nv, p) => B.qlLuuHang_(nv, p) },
  'ql.giaoCa':   { ql: true, sheets: [GC],        fn: (nv, p) => B.qlGiaoCa_(nv, p) },

  'ql.docCaiDat': { ql: true, sheets: [CA], fn: () => B.qlDocCaiDat_() },
  'ql.luuCaiDat': { ql: true, sheets: [],   fn: (nv, p) => B.qlLuuCaiDat_(nv, p) }
};

/* ================= Khởi tạo lần đầu ================= */

let daKhoiTao = false;

async function khoiTaoNeuCan_() {
  if (daKhoiTao) return;
  await taoSheetConThieu_();
  const db = await napDb_(SHEET_CAN_CHO_SETUP);
  chayVoiDb_(db, () => seed_());
  if (db.coThayDoi()) await db.flush();
  daKhoiTao = true;
}

/* ================= Handler ================= */

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, data: { song: true, serverTime: nowStamp_() } });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Chỉ hỗ trợ POST.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { token, action, payload } = body || {};
  const p = payload || {};

  const tt = THAO_TAC[action];
  if (!tt) {
    return res.status(200).json({ ok: false, error: 'Không hỗ trợ thao tác: ' + action });
  }

  try {
    await khoiTaoNeuCan_();

    const db = await napDb_([...NEN, ...tt.sheets]);
    const data = chayVoiDb_(db, () => {
      if (tt.cong) return tt.fn(null, p);

      const nv = xacThuc_(token);
      // Chưa đổi PIN mặc định thì chỉ được xem hồ sơ và đổi PIN
      if (bool_(nv.doiPinLanDau) && action !== 'doiPin' && action !== 'me') {
        throw new Error('FIRST_LOGIN: Bạn cần đổi PIN trước khi sử dụng.');
      }
      if (tt.ql) B.batBuocQuanLy_(nv);
      return tt.fn(nv, p);
    });

    if (db.coThayDoi()) await db.flush();
    return res.status(200).json({ ok: true, data });

  } catch (err) {
    const msg = err?.message || String(err);
    if (laLoiHeThong_(err)) {
      console.error('[LOI] ' + action + ' :: ' + msg + '\n' + (err?.stack || ''));
    }
    return res.status(200).json({ ok: false, error: msg });
  }
}
