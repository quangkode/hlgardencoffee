/* Chạy thử nghiệp vụ thật của app trên môi trường giả lập */
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const { taoMoiTruong, setNow } = require('./gasmock');

const DIR = process.argv[2];
const env = taoMoiTruong();
const ctx = vm.createContext(env);

// Nạp các file .gs theo đúng cách Apps Script gộp chung một scope
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.gs')).sort();
const src = files.map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n;\n');
vm.runInContext(src, ctx, { filename: 'all.gs' });
const run = (expr) => vm.runInContext(expr, ctx);

let pass = 0, fail = 0;
function ok(ten, dk, chiTiet) {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; console.log('  ✗ ' + ten + (chiTiet !== undefined ? '  →  ' + JSON.stringify(chiTiet) : '')); }
}
function nhom(t) { console.log('\n' + t); }
function api(token, action, payload) {
  const r = run('api(' + JSON.stringify(token) + ',' + JSON.stringify(action) + ',' + JSON.stringify(payload || {}) + ')');
  return r;
}
function must(token, action, payload) {
  const r = api(token, action, payload);
  if (!r.ok) throw new Error(action + ' thất bại: ' + r.error);
  return r.data;
}

/* ============ 1. Khởi tạo ============ */
nhom('1. Khởi tạo hệ thống');
run('khoiTaoHeThong()');
const shs = env._ss().getSheets().map(s => s.getName());
ok('tạo đủ 11 sheet', shs.length === 11, shs);
ok('có sheet ChamCong', shs.includes('ChamCong'));
ok('seed 4 ca làm việc', run('readAll_(SHEETS.CA).length') === 4);
ok('seed 12 mặt hàng', run('readAll_(SHEETS.HANG).length') === 12);
ok('seed 2 tài khoản', run('readAll_(SHEETS.NHANVIEN).length') === 2);

/* ============ 2. Đăng nhập ============ */
nhom('2. Đăng nhập & bảo mật');
ok('sai PIN bị từ chối', api(null, 'login', { maNV: 'QL001', pin: '9999' }).ok === false);
ok('mã không tồn tại bị từ chối', api(null, 'login', { maNV: 'XXX', pin: '1234' }).ok === false);

let r = api(null, 'login', { maNV: 'QL001', pin: '1234' });
ok('đăng nhập QL001 thành công', r.ok === true, r.error);
let tkQL = r.ok ? r.data.token : null;
ok('bị đánh dấu phải đổi PIN lần đầu', r.ok && r.data.me.doiPinLanDau === true);
ok('PIN không lưu dạng thô', JSON.stringify(run('readAll_(SHEETS.NHANVIEN)')).indexOf('"1234"') === -1);

ok('chưa đổi PIN thì bị chặn nghiệp vụ', api(tkQL, 'ql.tongQuan', {}).error.indexOf('FIRST_LOGIN') === 0);
ok('PIN mới quá dễ bị từ chối',
   api(tkQL, 'doiPin', { pinCu: '1234', pinMoi: '1111', pinMoiNhapLai: '1111' }).ok === false);
ok('hai lần nhập không khớp bị từ chối',
   api(tkQL, 'doiPin', { pinCu: '1234', pinMoi: '246813', pinMoiNhapLai: '246814' }).ok === false);

r = api(tkQL, 'doiPin', { pinCu: '1234', pinMoi: '246813', pinMoiNhapLai: '246813' });
ok('đổi PIN thành công', r.ok === true, r.error);
const tkQLcu = tkQL;
tkQL = r.data.token;
ok('token cũ bị vô hiệu sau khi đổi PIN', api(tkQLcu, 'ql.tongQuan', {}).ok === false);
ok('token mới dùng được', api(tkQL, 'ql.tongQuan', {}).ok === true);
ok('token bị sửa chữ ký bị từ chối', api(tkQL.slice(0, -3) + 'aaa', 'me', {}).ok === false);

// nhân viên
must(tkQL, 'ql.resetPin', { maNV: 'NV001', pin: '1234' });
let tkNV = must(null, 'login', { maNV: 'NV001', pin: '1234' }).token;
tkNV = must(tkNV, 'doiPin', { pinCu: '1234', pinMoi: '778899', pinMoiNhapLai: '778899' }).token;
ok('nhân viên không gọi được API quản lý', api(tkNV, 'ql.dsNhanVien', {}).ok === false);
ok('quản lý gọi được API quản lý', api(tkQL, 'ql.dsNhanVien', {}).ok === true);

/* ============ 3. Cài đặt & vị trí ============ */
nhom('3. Cài đặt quán');
// Phiên đăng nhập hết hạn đúng theo cài đặt
setNow('2026-08-16T04:00:00Z');   // +25 tiếng
ok('phiên quá 12 tiếng thì hết hạn', api(tkNV, 'cc.trangThai', {}).error.indexOf('hết hạn') >= 0);
setNow('2026-08-15T03:00:00Z');

must(tkQL, 'ql.luuCaiDat', { caiDat: {
  latQuan: '10.762622', lngQuan: '106.660172', banKinhChamCong: '150',
  chanNgoaiVung: 'FALSE', phutTreChoPhep: '5',
  luongGioMacDinh: '25000', phuCapCaMacDinh: '0', nguongPhutTinhPhuCap: '240', lamTronPhut: '0',
  thoiGianPhienDangNhap: '999999'   // test nhảy nhiều ngày, không muốn phiên hết hạn giữa chừng
}});
// cấp lại token với thời hạn dài
tkQL = must(null, 'login', { maNV: 'QL001', pin: '246813' }).token;
tkNV = must(null, 'login', { maNV: 'NV001', pin: '778899' }).token;
ok('lưu và đọc lại được toạ độ quán', run("getCfg_('latQuan','')") === '10.762622');
ok('không tạo dòng cài đặt trùng', run('readAll_(SHEETS.CAIDAT).length') === 17,
   run('readAll_(SHEETS.CAIDAT).length'));

/* ============ 4. Chấm công ============ */
nhom('4. Chấm công vào / ra');
setNow('2026-08-17T00:10:00Z');            // 07:10 VN — trễ 70' so với ca sáng 06:00
r = api(tkNV, 'cc.vao', { maCa: 'CA1', lat: 10.762622, lng: 106.660172 });
ok('chấm vào thành công', r.ok === true, r.error);
let cc = run('readAll_(SHEETS.CHAMCONG)')[0];
ok('ghi đúng giờ vào 07:10', cc.gioVao === '07:10', cc.gioVao);
ok('tính đúng trễ 70 phút', Number(cc.soPhutTre) === 70, cc.soPhutTre);
ok('trong bán kính → không gắn cờ ngoài vùng', String(cc.ngoaiVung) === 'FALSE');
ok('không có lịch duyệt → gắn cờ ngoài lịch', String(cc.ngoaiLich) === 'TRUE');
ok('đang trong ca thì không vào lại được', api(tkNV, 'cc.vao', { maCa: 'CA2' }).ok === false);

r = must(tkNV, 'cc.trangThai');
ok('trạng thái báo đang làm', r.dangLam === true);

setNow('2026-08-17T05:05:00Z');            // 12:05 VN
r = api(tkNV, 'cc.ra', { lat: 10.762622, lng: 106.660172 });
ok('chấm ra thành công', r.ok === true, r.error);
cc = run('readAll_(SHEETS.CHAMCONG)')[0];
ok('tính đúng 295 phút công', Number(cc.soPhutLam) === 295, cc.soPhutLam);
ok('không tính về sớm khi về trễ giờ', Number(cc.soPhutVeSom) === 0, cc.soPhutVeSom);
ok('trạng thái HoanThanh', cc.trangThai === 'HoanThanh');
ok('chưa vào thì không ra được', api(tkNV, 'cc.ra', {}).ok === false);
ok('cùng ngày cùng ca không chấm lại được', api(tkNV, 'cc.vao', { maCa: 'CA1' }).ok === false);

// ngoài vùng
setNow('2026-08-17T05:10:00Z');
r = api(tkNV, 'cc.vao', { maCa: 'CA2', lat: 10.80, lng: 106.70 });   // cách ~6km
ok('ngoài bán kính vẫn chấm được (chế độ cảnh báo)', r.ok === true, r.error);
cc = run('readAll_(SHEETS.CHAMCONG)').find(x => x.maCa === 'CA2');
ok('gắn cờ ngoài vùng', String(cc.ngoaiVung) === 'TRUE');
ok('ghi lại khoảng cách > 5km', Number(cc.khoangCachVao) > 5000, cc.khoangCachVao);

// bật chặn cứng
must(tkQL, 'ql.luuCaiDat', { caiDat: { chanNgoaiVung: 'TRUE' } });
setNow('2026-08-17T11:05:00Z');
must(tkNV, 'cc.ra', { lat: 10.762622, lng: 106.660172 });
setNow('2026-08-17T11:10:00Z');
ok('bật chặn cứng → ngoài vùng bị từ chối',
   api(tkNV, 'cc.vao', { maCa: 'CA3', lat: 10.80, lng: 106.70 }).ok === false);
must(tkQL, 'ql.luuCaiDat', { caiDat: { chanNgoaiVung: 'FALSE' } });

/* ============ 5. Ca qua đêm ============ */
nhom('5. Ca qua đêm');
must(tkQL, 'ql.luuCa', { maCa: 'CAD', tenCa: 'Ca đêm', gioBatDau: '22:00', gioKetThuc: '02:00',
                         soPhutNghi: 0, trangThai: 'HoatDong' });
setNow('2026-08-18T15:00:00Z');            // 22:00 VN ngày 18
must(tkNV, 'cc.vao', { maCa: 'CAD', lat: 10.762622, lng: 106.660172 });
setNow('2026-08-18T19:00:00Z');            // 02:00 VN ngày 19
r = api(tkNV, 'cc.ra', { lat: 10.762622, lng: 106.660172 });
ok('chấm ra sau nửa đêm thành công', r.ok === true, r.error);
cc = run('readAll_(SHEETS.CHAMCONG)').find(x => x.maCa === 'CAD');
ok('ca qua đêm tính đúng 240 phút', Number(cc.soPhutLam) === 240, cc.soPhutLam);
ok('ca qua đêm không bị tính trễ', Number(cc.soPhutTre) === 0, cc.soPhutTre);
ok('ca qua đêm ghi vào ngày bắt đầu', cc.ngay === '2026-08-18', cc.ngay);

/* ============ 6. Báo ca & duyệt ============ */
nhom('6. Báo ca và duyệt ca');
setNow('2026-08-19T02:00:00Z');            // 09:00 VN ngày 19
r = api(tkNV, 'ca.baoCa', { items: [{ ngay: '2026-08-25', maCa: 'CA1' }, { ngay: '2026-08-26', maCa: 'CA2' }] });
ok('báo 2 ca thành công', r.ok === true, r.error);
ok('báo ca cho hôm nay bị từ chối (phải trước 1 ngày)',
   api(tkNV, 'ca.baoCa', { items: [{ ngay: '2026-08-19', maCa: 'CA1' }] }).ok === false);
ok('báo trùng ca bị từ chối',
   api(tkNV, 'ca.baoCa', { items: [{ ngay: '2026-08-25', maCa: 'CA1' }] }).ok === false);

let lich = must(tkQL, 'ql.lichCa', { tuNgay: '2026-08-19', denNgay: '2026-09-10' });
ok('quản lý thấy 2 ca chờ duyệt', lich.danhSach.filter(x => x.trangThai === 'ChoDuyet').length === 2);
must(tkQL, 'ql.duyetCa', { ids: lich.danhSach.map(x => x.id), duyet: true });
lich = must(tkQL, 'ql.lichCa', { tuNgay: '2026-08-19', denNgay: '2026-09-10' });
ok('đã duyệt hết', lich.danhSach.every(x => x.trangThai === 'DaDuyet'));

must(tkQL, 'ql.xepCa', { items: [{ maNV: 'NV001', ngay: '2026-08-27', maCa: 'CA3' }] });
ok('xếp ca trùng bị chặn', api(tkQL, 'ql.xepCa', { items: [{ maNV: 'NV001', ngay: '2026-08-27', maCa: 'CA3' }] }).ok === false);

// chấm công đúng ca đã duyệt -> không còn cờ ngoài lịch
setNow('2026-08-25T00:00:00Z');            // 07:00 VN ngày 25
must(tkNV, 'cc.vao', { maCa: 'CA1', lat: 10.762622, lng: 106.660172 });
cc = run('readAll_(SHEETS.CHAMCONG)').find(x => x.ngay === '2026-08-25');
ok('chấm đúng ca đã duyệt → không gắn cờ ngoài lịch', String(cc.ngoaiLich) === 'FALSE');
setNow('2026-08-25T05:00:00Z');
must(tkNV, 'cc.ra', { lat: 10.762622, lng: 106.660172 });

/* ============ 7. Lương ============ */
nhom('7. Tính lương');
must(tkQL, 'ql.luuNhanVien', { maNV: 'NV001', hoTen: 'Nhân viên mẫu', chucVu: 'NhanVien',
  luongTheoGio: 30000, phuCapCa: 0, ngayVaoLam: '2026-01-01', trangThai: 'DangLam' });

let bl = must(tkQL, 'ql.bangLuong', { thang: '2026-08', maNV: 'NV001' });
let L = bl.danhSach[0];
/* Mọi ca tính như nhau: giờ × lương/giờ. Không hệ số, không phạt trễ.
   NV001 lương 30.000đ/giờ:
   17/8 CA1 07:10–12:05 = 295' -> 147.500   (trễ 70')
   17/8 CA2 12:10–18:05 = 355' -> 177.500   (trễ 10')
   18/8 CAD 22:00–02:00 = 240' -> 120.000   (trễ  0')
   25/8 CA1 07:00–12:00 = 300' -> 150.000   (trễ 60')
                    lương ca   = 595.000
   Thực nhận = 595.000 (không trừ gì cả)                                */
ok('đếm đúng 4 ca', L.soCa === 4, L.soCa);
ok('tổng phút công = 1190', L.tongPhutLam === 1190, L.tongPhutLam);
ok('lương ca = 595.000', L.luongCa === 595000, L.luongCa);
ok('ca đêm KHÔNG được nhân hệ số', L.chiTiet.find(c => c.maCa === 'CAD').tienCa === 120000,
   L.chiTiet.find(c => c.maCa === 'CAD').tienCa);
ok('không có phụ cấp khi để 0', L.phuCap === 0, L.phuCap);
ok('đi trễ KHÔNG bị trừ lương', L.thucNhan === 595000, L.thucNhan);
ok('vẫn thống kê 3 lần đi trễ cho quản lý xem', L.soLanTre === 3, L.soLanTre);
ok('không còn trường phạt trễ', L.phatTre === undefined, L.phatTre);

// phụ cấp là tuỳ chọn — bật lên thì vẫn cộng đúng
must(tkQL, 'ql.luuNhanVien', { maNV: 'NV001', hoTen: 'Nhân viên mẫu', chucVu: 'NhanVien',
  luongTheoGio: 30000, phuCapCa: 20000, ngayVaoLam: '2026-01-01', trangThai: 'DangLam' });
L = must(tkQL, 'ql.bangLuong', { thang: '2026-08', maNV: 'NV001' }).danhSach[0];
ok('bật phụ cấp thì cộng 20.000 × 4 ca', L.phuCap === 80000 && L.thucNhan === 675000, [L.phuCap, L.thucNhan]);
must(tkQL, 'ql.luuNhanVien', { maNV: 'NV001', hoTen: 'Nhân viên mẫu', chucVu: 'NhanVien',
  luongTheoGio: 30000, phuCapCa: 0, ngayVaoLam: '2026-01-01', trangThai: 'DangLam' });

must(tkQL, 'ql.luuThuongPhat', { maNV: 'NV001', thang: '2026-08', loai: 'Thuong', soTien: 200000, lyDo: 'Chăm chỉ' });
must(tkQL, 'ql.luuThuongPhat', { maNV: 'NV001', thang: '2026-08', loai: 'Phat', soTien: 50000, lyDo: 'Làm vỡ ly' });
L = must(tkQL, 'ql.bangLuong', { thang: '2026-08', maNV: 'NV001' }).danhSach[0];
ok('cộng thưởng, trừ phạt đúng', L.thucNhan === 595000 + 200000 - 50000, L.thucNhan);

let ml = must(tkNV, 'luong.cuaToi', { thang: '2026-08' });
ok('nhân viên xem được lương của chính mình', ml.luong.thucNhan === L.thucNhan);
ok('nhân viên chỉ thấy dữ liệu của mình', ml.luong.maNV === 'NV001');

must(tkQL, 'ql.chotLuong', { thang: '2026-08' });
ok('chốt lương ghi vào sheet BangLuong', run('readAll_(SHEETS.BANGLUONG).length') >= 1);
must(tkQL, 'ql.chotLuong', { thang: '2026-08' });
const soDongChot = run("readAll_(SHEETS.BANGLUONG).filter(r=>String(r.thang)==='2026-08').length");
const soNVDangLam = run("readAll_(SHEETS.NHANVIEN).filter(r=>String(r.trangThai)==='DangLam').length");
ok('chốt lại ghi đè, không nhân đôi dòng', soDongChot === soNVDangLam, { soDongChot, soNVDangLam });

/* ============ 8. Sửa công thủ công ============ */
nhom('8. Quản lý sửa công');
const dsCC = must(tkQL, 'ql.chamCong', { tuNgay: '2026-08-01', denNgay: '2026-08-31' });
const mucSua = dsCC.danhSach.find(x => x.ngay === '2026-08-25');
must(tkQL, 'ql.suaChamCong', { id: mucSua.id, gioVao: '06:00', gioRa: '12:00', ghiChu: 'Sửa lại giúp NV' });
cc = run('readAll_(SHEETS.CHAMCONG)').find(x => x.ngay === '2026-08-25');
ok('sửa giờ → tính lại 360 phút', Number(cc.soPhutLam) === 360, cc.soPhutLam);
ok('sửa giờ → xoá trễ', Number(cc.soPhutTre) === 0, cc.soPhutTre);
ok('ghi lại người sửa', cc.nguoiSua === 'QL001', cc.nguoiSua);
ok('giờ ra sai định dạng bị từ chối',
   api(tkQL, 'ql.suaChamCong', { id: mucSua.id, gioVao: '06:00', gioRa: 'abc' }).ok === false);

r = api(tkQL, 'ql.themChamCong', { maNV: 'NV001', ngay: '2026-08-28', maCa: 'CA1', gioVao: '06:00', gioRa: '12:00' });
ok('nhập công tay thành công', r.ok === true, r.error);
must(tkQL, 'ql.xoaChamCong', { id: run('readAll_(SHEETS.CHAMCONG)').find(x => x.ngay === '2026-08-28').id });
ok('xoá công thành công', !run('readAll_(SHEETS.CHAMCONG)').find(x => x.ngay === '2026-08-28'));

/* ============ 9. Kiểm kho ============ */
nhom('9. Kiểm kho');
let pm = must(tkNV, 'kho.phieuMoi');
ok('phiếu mới gom theo nhóm hàng', pm.nhomHang.length === 3, pm.nhomHang.map(g => g.ten));
ok('tồn kỳ trước ban đầu = 0', pm.nhomHang[0].items[0].tonTruoc === 0);

setNow('2026-08-29T05:00:00Z');
r = must(tkNV, 'kho.gui', { maCa: 'CA1', items: [
  { maHang: 'H001', nhapThem: 10, thucTe: 8 },
  { maHang: 'H002', nhapThem: 0, thucTe: 4 }     // định mức 10 -> cảnh báo
]});
ok('gửi phiếu kiểm kho thành công', !!r.maPhieu);
ok('cảnh báo hàng dưới định mức', r.canhBao.length === 1, r.canhBao);
let kk = run('readAll_(SHEETS.KIEMKHO)');
ok('ghi 2 dòng kiểm kho', kk.length === 2);
ok('hao hụt lần đầu = 0+10-8 = 2', Number(kk.find(x => x.maHang === 'H001').haoHut) === 2);

setNow('2026-08-29T11:00:00Z');
must(tkNV, 'kho.gui', { maCa: 'CA2', items: [{ maHang: 'H001', nhapThem: 0, thucTe: 5 }] });
kk = run('readAll_(SHEETS.KIEMKHO)').filter(x => x.maHang === 'H001');
const lan2 = kk[kk.length - 1];
ok('lần 2 lấy tồn trước = 8', Number(lan2.tonTruoc) === 8, lan2.tonTruoc);
ok('lần 2 hao hụt = 8+0-5 = 3', Number(lan2.haoHut) === 3, lan2.haoHut);

let khoQL = must(tkQL, 'ql.kho', { tuNgay: '2026-08-01', denNgay: '2026-08-31' });
const h001 = khoQL.thongKe.find(x => x.maHang === 'H001');
ok('quản lý thấy tổng hao 5', h001.tongHao === 5, h001.tongHao);
ok('quy đổi tiền hao = 5 x 180.000', h001.tienHao === 900000, h001.tienHao);
ok('gộp thành 2 phiếu', khoQL.phieu.length === 2, khoQL.phieu.length);

must(tkQL, 'ql.luuHang', { maHang: 'H099', tenHang: 'Syrup vải', donVi: 'chai',
                           nhomHang: 'Nguyên liệu', tonDinhMuc: 3, giaVon: 90000 });
ok('thêm mặt hàng mới', run('readAll_(SHEETS.HANG).length') === 13);
ok('mã hàng sai định dạng bị từ chối',
   api(tkQL, 'ql.luuHang', { maHang: 'x', tenHang: 'Test' }).ok === false);

/* ============ 10. Giao ca ============ */
nhom('10. Giao ca');
setNow('2026-08-29T11:30:00Z');
r = must(tkNV, 'gc.gui', {
  maCa: 'CA1', tienDauCa: 500000, tongDoanhThu: 3000000, tienChuyenKhoan: 1200000,
  tienMatCuoiCa: 2250000, tienNopVe: 1800000, soHoaDon: 87, maNVNhan: 'QL001',
  tinhTrangThietBi: 'Bình thường', vanDe: ''
});
// kỳ vọng tiền mặt = 500.000 + (3.000.000 - 1.200.000) = 2.300.000 -> thiếu 50.000
ok('tính đúng chênh lệch quỹ -50.000', r.chenhLech === -50000, r.chenhLech);
let gc = run('readAll_(SHEETS.GIAOCA)')[0];
ok('trạng thái chờ xác nhận', gc.trangThai === 'ChoXacNhan');
ok('không tự giao ca cho chính mình',
   api(tkNV, 'gc.gui', { maCa: 'CA1', maNVNhan: 'NV001' }).ok === false);

let cho = must(tkQL, 'gc.choToiXacNhan');
ok('người nhận thấy biên bản chờ xác nhận', cho.danhSach.length === 1);
ok('người khác không xác nhận thay được',
   api(tkNV, 'gc.xacNhan', { id: gc.id }).ok === false);
must(tkQL, 'gc.xacNhan', { id: gc.id });
gc = run('readAll_(SHEETS.GIAOCA)')[0];
ok('xác nhận thành công', gc.trangThai === 'DaXacNhan');
ok('không xác nhận hai lần', api(tkQL, 'gc.xacNhan', { id: gc.id }).ok === false);

let gcQL = must(tkQL, 'ql.giaoCa', { tuNgay: '2026-08-01', denNgay: '2026-08-31' });
ok('quản lý tổng hợp doanh thu', gcQL.tong.doanhThu === 3000000, gcQL.tong.doanhThu);
ok('quản lý tổng hợp lệch quỹ', gcQL.tong.chenhLech === -50000, gcQL.tong.chenhLech);

/* ============ 11. Tổng quan ============ */
nhom('11. Tổng quan quản lý');
setNow('2026-08-29T05:30:00Z');
let tq = must(tkQL, 'ql.tongQuan', {});
ok('đọc được tổng quan', typeof tq.dangLam === 'number');
ok('đếm nhân viên đang làm', tq.soNhanVien === 2, tq.soNhanVien);
ok('cảnh báo hàng dưới định mức', tq.soCanhBaoKho > 0, tq.soCanhBaoKho);
ok('có lương tạm tính tháng', tq.tongLuongTamTinh > 0);

/* ============ 12. Phân quyền & tự bảo vệ ============ */
nhom('12. Phân quyền');
ok('quản lý không tự bỏ quyền của mình',
   api(tkQL, 'ql.luuNhanVien', { maNV: 'QL001', hoTen: 'Quản lý', chucVu: 'NhanVien' }).ok === false);
ok('quản lý không tự khoá tài khoản mình',
   api(tkQL, 'ql.luuNhanVien', { maNV: 'QL001', hoTen: 'Quản lý', chucVu: 'QuanLy', trangThai: 'NghiViec' }).ok === false);
ok('action lạ bị từ chối', api(tkQL, 'ql.xoaSachDuLieu', {}).ok === false);
ok('gọi API không token bị từ chối', api(null, 'cc.trangThai', {}).ok === false);

must(tkQL, 'ql.luuNhanVien', { maNV: 'NV002', hoTen: 'Trần Thị B', chucVu: 'NhanVien',
  luongTheoGio: 28000, phuCapCa: 15000, ngayVaoLam: '2026-08-01', trangThai: 'DangLam', pin: '1234' });
ok('thêm nhân viên mới', run('readAll_(SHEETS.NHANVIEN).length') === 3);
must(tkQL, 'ql.luuNhanVien', { maNV: 'NV002', hoTen: 'Trần Thị B', chucVu: 'NhanVien',
  luongTheoGio: 28000, phuCapCa: 15000, trangThai: 'NghiViec' });
ok('nhân viên nghỉ việc không đăng nhập được',
   api(null, 'login', { maNV: 'NV002', pin: '1234' }).ok === false);

/* ============ 12b. Chống dò PIN & quên chấm ra ============ */
nhom('12b. Chống dò PIN và ca bỏ quên');
for (let i = 0; i < 5; i++) api(null, 'login', { maNV: 'NV001', pin: '000' + i });
r = api(null, 'login', { maNV: 'NV001', pin: '778899' });
ok('khoá tạm sau 5 lần sai PIN dù nhập đúng', r.ok === false, r.error);
ok('thông báo hướng dẫn rõ ràng', /5 lần|reset/i.test(r.error), r.error);
run("CacheService.getScriptCache().remove('fail_NV001')");
ok('hết khoá thì đăng nhập lại được', api(null, 'login', { maNV: 'NV001', pin: '778899' }).ok === true);
tkNV = must(null, 'login', { maNV: 'NV001', pin: '778899' }).token;

// (a) quên chấm ra sang hôm sau -> chặn và bắt báo quản lý
setNow('2026-09-01T00:10:00Z');           // 07:10 VN ngày 1/9
must(tkNV, 'cc.vao', { maCa: 'CA1', lat: 10.762622, lng: 106.660172 });
setNow('2026-09-02T05:00:00Z');           // hôm sau
r = api(tkNV, 'cc.ra', { lat: 10.762622, lng: 106.660172 });
ok('ca quá 18 tiếng bị chặn, bắt báo quản lý', r.ok === false && /18 tiếng|quên/.test(r.error), r.error);

// (b) để lâu hơn nữa -> không được chặn nhân viên đi làm ca mới
setNow('2026-09-03T00:10:00Z');
r = api(tkNV, 'cc.vao', { maCa: 'CA1', lat: 10.762622, lng: 106.660172 });
ok('ca bỏ quên cũ không chặn ca mới', r.ok === true, r.error);
tq = must(tkQL, 'ql.tongQuan', {});
ok('tổng quan cảnh báo ca quên chấm ra', tq.quenChamRa === 1, tq.quenChamRa);
ok('"đang trong ca" không đếm ca bỏ quên', tq.dangLam === 1, tq.dangLam);
const dtc = must(tkQL, 'ql.dangTrongCa');
ok('danh sách trực tuyến gắn cờ ca bỏ quên',
   dtc.danhSach.filter(x => x.boQuen).length === 1, dtc.danhSach.map(x => [x.ngay, x.boQuen]));

const boQuen = must(tkQL, 'ql.chamCong', { tuNgay: '2026-09-01', denNgay: '2026-09-01' }).danhSach[0];
must(tkQL, 'ql.suaChamCong', { id: boQuen.id, gioVao: '07:10', gioRa: '12:00' });
ok('quản lý sửa tay thì đóng được ca bỏ quên',
   run("readAll_(SHEETS.CHAMCONG).filter(r=>r.ngay==='2026-09-01')[0].trangThai") === 'HoanThanh');
ok('sau khi sửa, cảnh báo biến mất', must(tkQL, 'ql.tongQuan', {}).quenChamRa === 0);

/* ============ 13. Nhật ký ============ */
nhom('13. Nhật ký hoạt động');
ok('có ghi nhật ký', run('readAll_(SHEETS.NHATKY).length') > 10, run('readAll_(SHEETS.NHATKY).length'));

console.log('\n───────────────────────────────');
console.log(pass + ' đạt / ' + fail + ' lỗi');
process.exit(fail ? 1 : 0);
