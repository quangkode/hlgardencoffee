/*******************************************************
 * Code.gs — Điểm vào web app + bộ định tuyến API
 *
 * Toàn bộ client gọi qua đúng 1 hàm: api(token, action, payload)
 * => dễ kiểm soát quyền, dễ log.
 *******************************************************/

const APP_NAME = 'Chấm Công Quán Cà Phê';

function doGet(e) {
  ensureSetup_();
  const t = HtmlService.createTemplateFromFile('Index');
  t.tenQuan = getCfg_('tenQuan', APP_NAME);
  return t.evaluate()
    .setTitle(getCfg_('tenQuan', APP_NAME))
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover')
    .addMetaTag('mobile-web-app-capable', 'yes')
    .addMetaTag('apple-mobile-web-app-capable', 'yes')
    .addMetaTag('theme-color', '#3f2a1d')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(f) {
  return HtmlService.createHtmlOutputFromFile(f).getContent();
}

/* ---------------- Bộ định tuyến ---------------- */

/** Action không cần đăng nhập. */
const ACTION_CONG_KHAI = {
  'login': (p) => login_(p),
  'appInfo': () => ({
    tenQuan: getCfg_('tenQuan', APP_NAME),
    diaChiQuan: getCfg_('diaChiQuan', ''),
    serverTime: nowStamp_()
  })
};

/** Action cần đăng nhập. nv = object nhân viên. */
const ACTION_NOI_BO = {
  /* --- tài khoản --- */
  'me':            (nv) => ({ me: hoSoCongKhai_(nv), cauHinh: cauHinhChoClient_() }),
  'doiPin':        (nv, p) => doiPin_(nv, p),

  /* --- chấm công --- */
  'cc.trangThai':  (nv) => ccTrangThai_(nv),
  'cc.vao':        (nv, p) => ccVao_(nv, p),
  'cc.ra':         (nv, p) => ccRa_(nv, p),
  'cc.lichSu':     (nv, p) => ccLichSu_(nv, p),

  /* --- ca / báo ca --- */
  'ca.danhSachCa': ()      => caDanhSach_(),
  'ca.cuaToi':     (nv, p) => caCuaToi_(nv, p),
  'ca.baoCa':      (nv, p) => caBaoCa_(nv, p),
  'ca.huyBaoCa':   (nv, p) => caHuyBaoCa_(nv, p),

  /* --- lương --- */
  'luong.cuaToi':  (nv, p) => luongCuaToi_(nv, p),

  /* --- kho --- */
  'kho.danhMuc':   ()      => khoDanhMuc_(),
  'kho.phieuMoi':  (nv, p) => khoPhieuMoi_(nv, p),
  'kho.gui':       (nv, p) => khoGui_(nv, p),
  'kho.lichSu':    (nv, p) => khoLichSu_(nv, p),

  /* --- giao ca --- */
  'gc.dsNguoiNhan': (nv)    => gcDanhSachNguoiNhan_(nv),
  'gc.gui':         (nv, p) => gcGui_(nv, p),
  'gc.danhSach':    (nv, p) => gcDanhSach_(nv, p),
  'gc.xacNhan':     (nv, p) => gcXacNhan_(nv, p),
  'gc.choToiXacNhan': (nv)  => gcChoToiXacNhan_(nv),

  /* --- QUẢN LÝ --- */
  'ql.tongQuan':     (nv, p) => qlTongQuan_(batBuocQuanLy_(nv), p),
  'ql.dangTrongCa':  (nv)    => qlDangTrongCa_(batBuocQuanLy_(nv)),

  'ql.dsNhanVien':   (nv)    => qlDsNhanVien_(batBuocQuanLy_(nv)),
  'ql.luuNhanVien':  (nv, p) => qlLuuNhanVien_(batBuocQuanLy_(nv), p),
  'ql.resetPin':     (nv, p) => qlResetPin_(batBuocQuanLy_(nv), p),

  'ql.chamCong':     (nv, p) => qlChamCong_(batBuocQuanLy_(nv), p),
  'ql.suaChamCong':  (nv, p) => qlSuaChamCong_(batBuocQuanLy_(nv), p),
  'ql.xoaChamCong':  (nv, p) => qlXoaChamCong_(batBuocQuanLy_(nv), p),
  'ql.themChamCong': (nv, p) => qlThemChamCong_(batBuocQuanLy_(nv), p),

  'ql.lichCa':       (nv, p) => qlLichCa_(batBuocQuanLy_(nv), p),
  'ql.duyetCa':      (nv, p) => qlDuyetCa_(batBuocQuanLy_(nv), p),
  'ql.xepCa':        (nv, p) => qlXepCa_(batBuocQuanLy_(nv), p),
  'ql.xoaLichCa':    (nv, p) => qlXoaLichCa_(batBuocQuanLy_(nv), p),
  'ql.luuCa':        (nv, p) => qlLuuCa_(batBuocQuanLy_(nv), p),

  'ql.bangLuong':    (nv, p) => qlBangLuong_(batBuocQuanLy_(nv), p),
  'ql.chotLuong':    (nv, p) => qlChotLuong_(batBuocQuanLy_(nv), p),
  'ql.thuongPhat':   (nv, p) => qlThuongPhat_(batBuocQuanLy_(nv), p),
  'ql.luuThuongPhat':(nv, p) => qlLuuThuongPhat_(batBuocQuanLy_(nv), p),
  'ql.xoaThuongPhat':(nv, p) => qlXoaThuongPhat_(batBuocQuanLy_(nv), p),

  'ql.kho':          (nv, p) => qlKho_(batBuocQuanLy_(nv), p),
  'ql.luuHang':      (nv, p) => qlLuuHang_(batBuocQuanLy_(nv), p),
  'ql.xoaHang':      (nv, p) => qlXoaHang_(batBuocQuanLy_(nv), p),

  'ql.giaoCa':       (nv, p) => qlGiaoCa_(batBuocQuanLy_(nv), p),

  'ql.docCaiDat':    (nv)    => qlDocCaiDat_(batBuocQuanLy_(nv)),
  'ql.luuCaiDat':    (nv, p) => qlLuuCaiDat_(batBuocQuanLy_(nv), p),
  'ql.linkSheet':    (nv)    => { batBuocQuanLy_(nv); return { url: ss_().getUrl() }; }
};

/**
 * Cổng API duy nhất. Luôn trả về {ok:true, data} hoặc {ok:false, error}.
 * Không bao giờ ném exception ra ngoài để client xử lý đồng nhất.
 */
function api(token, action, payload) {
  const p = payload || {};
  try {
    if (ACTION_CONG_KHAI[action]) {
      return { ok: true, data: ACTION_CONG_KHAI[action](p) };
    }
    const fn = ACTION_NOI_BO[action];
    if (!fn) return { ok: false, error: 'Không hỗ trợ thao tác: ' + action };

    const nv = xacThuc_(token);

    // Chưa đổi PIN lần đầu thì chỉ được gọi 2 action này
    if (bool_(nv.doiPinLanDau) && action !== 'doiPin' && action !== 'me') {
      return { ok: false, error: 'FIRST_LOGIN: Bạn cần đổi PIN trước khi sử dụng.' };
    }

    return { ok: true, data: fn(nv, p) };
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    if (msg.indexOf('AUTH:') !== 0) {
      try { Logger.log('[API ERROR] ' + action + ' :: ' + msg + '\n' + (err && err.stack)); } catch (e) {}
    }
    return { ok: false, error: msg };
  }
}

/* ---------------- Tiện ích dùng chung ---------------- */

/** Map maNV -> object nhân viên. */
function mapNhanVien_() {
  const m = {};
  readAll_(SHEETS.NHANVIEN).forEach(r => { m[String(r.maNV).trim().toUpperCase()] = r; });
  return m;
}

/** Map maCa -> object ca (kèm số phút chuẩn hoá). */
function mapCa_() {
  const m = {};
  readAll_(SHEETS.CA).forEach(r => {
    const bd = phutTuChuoi_(tstr_(r.gioBatDau));
    let kt = phutTuChuoi_(tstr_(r.gioKetThuc));
    if (kt >= 0 && bd >= 0 && kt <= bd) kt += 1440; // ca qua đêm
    m[String(r.maCa).trim().toUpperCase()] = {
      maCa: String(r.maCa).trim().toUpperCase(),
      tenCa: r.tenCa,
      gioBatDau: tstr_(r.gioBatDau),
      gioKetThuc: tstr_(r.gioKetThuc),
      phutBatDau: bd,
      phutKetThuc: kt,
      soPhutNghi: num_(r.soPhutNghi),
      heSoLuong: num_(r.heSoLuong) || 1,
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

/** Lọc theo khoảng ngày (chuỗi yyyy-MM-dd). */
function trongKhoang_(ngay, tu, den) {
  const n = dstr_(ngay);
  if (tu && n < tu) return false;
  if (den && n > den) return false;
  return true;
}

/** Trả về {tu, den} của một tháng yyyy-MM. */
function khoangThang_(thang) {
  const t = String(thang || thangHienTai_()).slice(0, 7);
  const y = parseInt(t.slice(0, 4), 10), m = parseInt(t.slice(5, 7), 10);
  const cuoi = new Date(y, m, 0).getDate();
  return { thang: t, tu: t + '-01', den: t + '-' + pad2_(cuoi) };
}

/** Lưu ảnh base64 vào Drive, trả link. */
function luuAnh_(base64, tenFile) {
  if (!base64) return '';
  try {
    const props = PropertiesService.getScriptProperties();
    let folderId = props.getProperty('ANH_FOLDER_ID');
    let folder;
    if (folderId) {
      try { folder = DriveApp.getFolderById(folderId); } catch (e) { folder = null; }
    }
    if (!folder) {
      folder = DriveApp.createFolder('Anh Cham Cong - ' + getCfg_('tenQuan', 'Quan'));
      props.setProperty('ANH_FOLDER_ID', folder.getId());
    }
    const data = String(base64).replace(/^data:image\/\w+;base64,/, '');
    const blob = Utilities.newBlob(Utilities.base64Decode(data), 'image/jpeg', tenFile + '.jpg');
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (e) {
    return '';
  }
}
