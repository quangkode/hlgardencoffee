/*******************************************************
 * test.js — Kiểm thử toàn bộ nghiệp vụ trên bản Vercel
 *
 * Chạy:  node kiem-thu/test.js
 * Gọi thẳng vào handler API thật, qua lớp Google Sheets giả lập,
 * nên bao gồm cả xác thực, phân quyền và phần ghi dữ liệu theo lô.
 *******************************************************/

import {
  lapMoiTruong, lapFetch, lapDongHo, datGio,
  docSheet, tenCacSheet, soLanGoi, resetDemGoi
} from './sheets-mock.js';

lapMoiTruong();
lapFetch();
lapDongHo();

const { default: handler } = await import('../api/index.js');
const { boNhoTam } = await import('../api/_lib/core.js');

/* ---------- Khung kiểm thử ---------- */

let dat = 0, hong = 0;
function ok(ten, dk, chiTiet) {
  if (dk) { dat++; console.log('  ✓ ' + ten); }
  else { hong++; console.log('  ✗ ' + ten + (chiTiet !== undefined ? '  →  ' + JSON.stringify(chiTiet) : '')); }
}
function nhom(t) { console.log('\n' + t); }

async function api(token, action, payload) {
  const req = { method: 'POST', body: { token, action, payload: payload || {} } };
  let ketQua;
  const res = {
    setHeader() {}, status() { return res; },
    json(o) { ketQua = o; return res; }
  };
  await handler(req, res);
  return ketQua;
}
async function must(token, action, payload) {
  const r = await api(token, action, payload);
  if (!r.ok) throw new Error(action + ' thất bại: ' + r.error);
  return r.data;
}
function caiDat(key) {
  return docSheet('CaiDat').find(r => r.key === key)?.value;
}

/* ============ 1. Khởi tạo ============ */
nhom('1. Khởi tạo tự động ở lượt gọi đầu tiên');
let r = await api(null, 'appInfo', {});
ok('gọi được khi bảng tính còn trống', r.ok === true, r.error);
ok('tạo đủ 11 sheet', tenCacSheet().length === 11, tenCacSheet());
ok('có sheet ChamCong', tenCacSheet().includes('ChamCong'));
ok('seed 16 cài đặt', docSheet('CaiDat').length === 16, docSheet('CaiDat').length);
ok('seed 4 ca làm việc', docSheet('CaLamViec').length === 4);
ok('seed 12 mặt hàng', docSheet('DanhMucHang').length === 12);
ok('seed 2 tài khoản', docSheet('NhanVien').length === 2);
ok('phụ cấp ca mặc định tắt', caiDat('phuCapCaMacDinh') === '0', caiDat('phuCapCaMacDinh'));
ok('không còn cài đặt phạt trễ', caiDat('phatTrePhut') === undefined);

/* ============ 2. Đăng nhập & bảo mật ============ */
nhom('2. Đăng nhập & bảo mật');
ok('sai PIN bị từ chối', (await api(null, 'login', { maNV: 'QL001', pin: '9999' })).ok === false);
ok('mã không tồn tại bị từ chối', (await api(null, 'login', { maNV: 'XXX', pin: '1234' })).ok === false);

r = await api(null, 'login', { maNV: 'QL001', pin: '1234' });
ok('đăng nhập QL001 thành công', r.ok === true, r.error);
let tkQL = r.ok ? r.data.token : null;
ok('bị đánh dấu phải đổi PIN lần đầu', r.data.me.doiPinLanDau === true);
ok('PIN không lưu dạng thô', !JSON.stringify(docSheet('NhanVien')).includes('"1234"'));

ok('chưa đổi PIN thì bị chặn nghiệp vụ',
   (await api(tkQL, 'ql.tongQuan', {})).error.startsWith('FIRST_LOGIN'));
ok('PIN mới quá dễ bị từ chối',
   (await api(tkQL, 'doiPin', { pinCu: '1234', pinMoi: '1111', pinMoiNhapLai: '1111' })).ok === false);
ok('hai lần nhập không khớp bị từ chối',
   (await api(tkQL, 'doiPin', { pinCu: '1234', pinMoi: '246813', pinMoiNhapLai: '246814' })).ok === false);

r = await api(tkQL, 'doiPin', { pinCu: '1234', pinMoi: '246813', pinMoiNhapLai: '246813' });
ok('đổi PIN thành công', r.ok === true, r.error);
const tkQLcu = tkQL;
tkQL = r.data.token;
ok('token cũ bị vô hiệu sau khi đổi PIN', (await api(tkQLcu, 'ql.tongQuan', {})).ok === false);
ok('token mới dùng được', (await api(tkQL, 'ql.tongQuan', {})).ok === true);
ok('token bị sửa chữ ký bị từ chối', (await api(tkQL.slice(0, -3) + 'aaa', 'me', {})).ok === false);

await must(tkQL, 'ql.resetPin', { maNV: 'NV001', pin: '1234' });
let tkNV = (await must(null, 'login', { maNV: 'NV001', pin: '1234' })).token;
tkNV = (await must(tkNV, 'doiPin', { pinCu: '1234', pinMoi: '778899', pinMoiNhapLai: '778899' })).token;
ok('nhân viên không gọi được API quản lý', (await api(tkNV, 'ql.dsNhanVien', {})).ok === false);
ok('quản lý gọi được API quản lý', (await api(tkQL, 'ql.dsNhanVien', {})).ok === true);

/* ============ 3. Cài đặt ============ */
nhom('3. Cài đặt quán');
datGio('2026-08-16T04:00:00Z');                       // +25 tiếng
ok('phiên quá 12 tiếng thì hết hạn',
   (await api(tkNV, 'cc.trangThai', {})).error.includes('hết hạn'));
datGio('2026-08-15T03:00:00Z');

await must(tkQL, 'ql.luuCaiDat', { caiDat: {
  latQuan: '10.762622', lngQuan: '106.660172', banKinhChamCong: '150',
  chanNgoaiVung: 'FALSE', phutTreChoPhep: '5',
  luongGioMacDinh: '25000', phuCapCaMacDinh: '0', nguongPhutTinhPhuCap: '240',
  lamTronPhut: '0', thoiGianPhienDangNhap: '999999'
}});
tkQL = (await must(null, 'login', { maNV: 'QL001', pin: '246813' })).token;
tkNV = (await must(null, 'login', { maNV: 'NV001', pin: '778899' })).token;
ok('lưu và đọc lại được toạ độ quán', caiDat('latQuan') === '10.762622');
ok('không tạo dòng cài đặt trùng', docSheet('CaiDat').length === 16, docSheet('CaiDat').length);

/* ============ 4. Chấm công ============ */
nhom('4. Chấm công vào / ra');
datGio('2026-08-17T00:10:00Z');                       // 07:10 VN, trễ 70' so với ca sáng
r = await api(tkNV, 'cc.vao', { maCa: 'CA1', lat: 10.762622, lng: 106.660172 });
ok('chấm vào thành công', r.ok === true, r.error);
let cc = docSheet('ChamCong')[0];
ok('ghi đúng giờ vào 07:10', cc.gioVao === '07:10', cc.gioVao);
ok('tính đúng trễ 70 phút', Number(cc.soPhutTre) === 70, cc.soPhutTre);
ok('trong bán kính → không gắn cờ ngoài vùng', cc.ngoaiVung === 'FALSE');
ok('không có lịch duyệt → gắn cờ ngoài lịch', cc.ngoaiLich === 'TRUE');
ok('đang trong ca thì không vào lại được', (await api(tkNV, 'cc.vao', { maCa: 'CA2' })).ok === false);
ok('trạng thái báo đang làm', (await must(tkNV, 'cc.trangThai')).dangLam === true);

datGio('2026-08-17T05:05:00Z');                       // 12:05 VN
r = await api(tkNV, 'cc.ra', { lat: 10.762622, lng: 106.660172 });
ok('chấm ra thành công', r.ok === true, r.error);
cc = docSheet('ChamCong')[0];
ok('tính đúng 295 phút công', Number(cc.soPhutLam) === 295, cc.soPhutLam);
ok('không tính về sớm khi về trễ giờ', Number(cc.soPhutVeSom) === 0, cc.soPhutVeSom);
ok('trạng thái HoanThanh', cc.trangThai === 'HoanThanh');
ok('chưa vào thì không ra được', (await api(tkNV, 'cc.ra', {})).ok === false);
ok('cùng ngày cùng ca không chấm lại được', (await api(tkNV, 'cc.vao', { maCa: 'CA1' })).ok === false);

datGio('2026-08-17T05:10:00Z');
r = await api(tkNV, 'cc.vao', { maCa: 'CA2', lat: 10.80, lng: 106.70 });   // cách ~6km
ok('ngoài bán kính vẫn chấm được (chế độ cảnh báo)', r.ok === true, r.error);
cc = docSheet('ChamCong').find(x => x.maCa === 'CA2');
ok('gắn cờ ngoài vùng', cc.ngoaiVung === 'TRUE');
ok('ghi lại khoảng cách > 5km', Number(cc.khoangCachVao) > 5000, cc.khoangCachVao);

await must(tkQL, 'ql.luuCaiDat', { caiDat: { chanNgoaiVung: 'TRUE' } });
datGio('2026-08-17T11:05:00Z');
await must(tkNV, 'cc.ra', { lat: 10.762622, lng: 106.660172 });
datGio('2026-08-17T11:10:00Z');
ok('bật chặn cứng → ngoài vùng bị từ chối',
   (await api(tkNV, 'cc.vao', { maCa: 'CA3', lat: 10.80, lng: 106.70 })).ok === false);
await must(tkQL, 'ql.luuCaiDat', { caiDat: { chanNgoaiVung: 'FALSE' } });

/* ============ 5. Ca qua đêm ============ */
nhom('5. Ca qua đêm');
await must(tkQL, 'ql.luuCa', { maCa: 'CAD', tenCa: 'Ca đêm', gioBatDau: '22:00',
                               gioKetThuc: '02:00', soPhutNghi: 0, trangThai: 'HoatDong' });
datGio('2026-08-18T15:00:00Z');                       // 22:00 VN ngày 18
await must(tkNV, 'cc.vao', { maCa: 'CAD', lat: 10.762622, lng: 106.660172 });
datGio('2026-08-18T19:00:00Z');                       // 02:00 VN ngày 19
r = await api(tkNV, 'cc.ra', { lat: 10.762622, lng: 106.660172 });
ok('chấm ra sau nửa đêm thành công', r.ok === true, r.error);
cc = docSheet('ChamCong').find(x => x.maCa === 'CAD');
ok('ca qua đêm tính đúng 240 phút', Number(cc.soPhutLam) === 240, cc.soPhutLam);
ok('ca qua đêm không bị tính trễ', Number(cc.soPhutTre) === 0, cc.soPhutTre);
ok('ca qua đêm ghi vào ngày bắt đầu', cc.ngay === '2026-08-18', cc.ngay);

/* ============ 6. Báo ca & duyệt ============ */
nhom('6. Báo ca và duyệt ca');
datGio('2026-08-19T02:00:00Z');
r = await api(tkNV, 'ca.baoCa', { items: [{ ngay: '2026-08-25', maCa: 'CA1' },
                                          { ngay: '2026-08-26', maCa: 'CA2' }] });
ok('báo 2 ca thành công', r.ok === true, r.error);
ok('báo ca cho hôm nay bị từ chối (phải trước 1 ngày)',
   (await api(tkNV, 'ca.baoCa', { items: [{ ngay: '2026-08-19', maCa: 'CA1' }] })).ok === false);
ok('báo trùng ca bị từ chối',
   (await api(tkNV, 'ca.baoCa', { items: [{ ngay: '2026-08-25', maCa: 'CA1' }] })).ok === false);

let lich = await must(tkQL, 'ql.lichCa', { tuNgay: '2026-08-19', denNgay: '2026-09-10' });
ok('quản lý thấy 2 ca chờ duyệt', lich.danhSach.filter(x => x.trangThai === 'ChoDuyet').length === 2);
await must(tkQL, 'ql.duyetCa', { ids: lich.danhSach.map(x => x.id), duyet: true });
lich = await must(tkQL, 'ql.lichCa', { tuNgay: '2026-08-19', denNgay: '2026-09-10' });
ok('đã duyệt hết', lich.danhSach.every(x => x.trangThai === 'DaDuyet'));

await must(tkQL, 'ql.xepCa', { items: [{ maNV: 'NV001', ngay: '2026-08-27', maCa: 'CA3' }] });
ok('xếp ca trùng bị chặn',
   (await api(tkQL, 'ql.xepCa', { items: [{ maNV: 'NV001', ngay: '2026-08-27', maCa: 'CA3' }] })).ok === false);

datGio('2026-08-25T00:00:00Z');                       // 07:00 VN ngày 25
await must(tkNV, 'cc.vao', { maCa: 'CA1', lat: 10.762622, lng: 106.660172 });
cc = docSheet('ChamCong').find(x => x.ngay === '2026-08-25');
ok('chấm đúng ca đã duyệt → không gắn cờ ngoài lịch', cc.ngoaiLich === 'FALSE');
datGio('2026-08-25T05:00:00Z');
await must(tkNV, 'cc.ra', { lat: 10.762622, lng: 106.660172 });

/* ============ 7. Lương ============ */
nhom('7. Tính lương');
await must(tkQL, 'ql.luuNhanVien', { maNV: 'NV001', hoTen: 'Nhân viên mẫu', chucVu: 'NhanVien',
  luongTheoGio: 30000, phuCapCa: 0, ngayVaoLam: '2026-01-01', trangThai: 'DangLam' });

let L = (await must(tkQL, 'ql.bangLuong', { thang: '2026-08', maNV: 'NV001' })).danhSach[0];
/* Mọi ca tính như nhau: giờ × lương/giờ. Không hệ số, không phạt trễ.
   17/8 CA1 07:10–12:05 = 295' -> 147.500   (trễ 70')
   17/8 CA2 12:10–18:05 = 355' -> 177.500   (trễ 10')
   18/8 CAD 22:00–02:00 = 240' -> 120.000   (trễ  0')
   25/8 CA1 07:00–12:00 = 300' -> 150.000   (trễ 60')
                lương ca      = 595.000                              */
ok('đếm đúng 4 ca', L.soCa === 4, L.soCa);
ok('tổng phút công = 1190', L.tongPhutLam === 1190, L.tongPhutLam);
ok('lương ca = 595.000', L.luongCa === 595000, L.luongCa);
ok('ca đêm KHÔNG được nhân hệ số',
   L.chiTiet.find(c => c.maCa === 'CAD').tienCa === 120000);
ok('không có phụ cấp khi để 0', L.phuCap === 0, L.phuCap);
ok('đi trễ KHÔNG bị trừ lương', L.thucNhan === 595000, L.thucNhan);
ok('vẫn thống kê 3 lần đi trễ cho quản lý xem', L.soLanTre === 3, L.soLanTre);
ok('không còn trường phạt trễ', L.phatTre === undefined);

await must(tkQL, 'ql.luuNhanVien', { maNV: 'NV001', hoTen: 'Nhân viên mẫu', chucVu: 'NhanVien',
  luongTheoGio: 30000, phuCapCa: 20000, ngayVaoLam: '2026-01-01', trangThai: 'DangLam' });
L = (await must(tkQL, 'ql.bangLuong', { thang: '2026-08', maNV: 'NV001' })).danhSach[0];
ok('bật phụ cấp thì cộng 20.000 × 4 ca',
   L.phuCap === 80000 && L.thucNhan === 675000, [L.phuCap, L.thucNhan]);
await must(tkQL, 'ql.luuNhanVien', { maNV: 'NV001', hoTen: 'Nhân viên mẫu', chucVu: 'NhanVien',
  luongTheoGio: 30000, phuCapCa: 0, ngayVaoLam: '2026-01-01', trangThai: 'DangLam' });

await must(tkQL, 'ql.luuThuongPhat', { maNV: 'NV001', thang: '2026-08', loai: 'Thuong', soTien: 200000, lyDo: 'Chăm chỉ' });
await must(tkQL, 'ql.luuThuongPhat', { maNV: 'NV001', thang: '2026-08', loai: 'Phat', soTien: 50000, lyDo: 'Làm vỡ ly' });
L = (await must(tkQL, 'ql.bangLuong', { thang: '2026-08', maNV: 'NV001' })).danhSach[0];
ok('cộng thưởng, trừ phạt đúng', L.thucNhan === 595000 + 200000 - 50000, L.thucNhan);

const ml = await must(tkNV, 'luong.cuaToi', { thang: '2026-08' });
ok('nhân viên xem được lương của chính mình', ml.luong.thucNhan === L.thucNhan);
ok('nhân viên chỉ thấy dữ liệu của mình', ml.luong.maNV === 'NV001');

await must(tkQL, 'ql.chotLuong', { thang: '2026-08' });
await must(tkQL, 'ql.chotLuong', { thang: '2026-08' });
const soChot = docSheet('BangLuong').filter(x => x.thang === '2026-08').length;
const soDangLam = docSheet('NhanVien').filter(x => x.trangThai === 'DangLam').length;
ok('chốt lại ghi đè, không nhân đôi dòng', soChot === soDangLam, { soChot, soDangLam });

/* ============ 8. Sửa công ============ */
nhom('8. Quản lý sửa công');
const dsCC = await must(tkQL, 'ql.chamCong', { tuNgay: '2026-08-01', denNgay: '2026-08-31' });
const mucSua = dsCC.danhSach.find(x => x.ngay === '2026-08-25');
await must(tkQL, 'ql.suaChamCong', { id: mucSua.id, gioVao: '06:00', gioRa: '12:00', ghiChu: 'Sửa giúp NV' });
cc = docSheet('ChamCong').find(x => x.ngay === '2026-08-25');
ok('sửa giờ → tính lại 360 phút', Number(cc.soPhutLam) === 360, cc.soPhutLam);
ok('sửa giờ → xoá trễ', Number(cc.soPhutTre) === 0, cc.soPhutTre);
ok('ghi lại người sửa', cc.nguoiSua === 'QL001', cc.nguoiSua);
ok('giờ ra sai định dạng bị từ chối',
   (await api(tkQL, 'ql.suaChamCong', { id: mucSua.id, gioVao: '06:00', gioRa: 'abc' })).ok === false);

r = await api(tkQL, 'ql.themChamCong', { maNV: 'NV001', ngay: '2026-08-28', maCa: 'CA1', gioVao: '06:00', gioRa: '12:00' });
ok('nhập công tay thành công', r.ok === true, r.error);
await must(tkQL, 'ql.xoaChamCong', { id: docSheet('ChamCong').find(x => x.ngay === '2026-08-28').id });
ok('xoá công thành công', !docSheet('ChamCong').find(x => x.ngay === '2026-08-28'));

/* ============ 9. Kiểm kho ============ */
nhom('9. Kiểm kho');
const pm = await must(tkNV, 'kho.phieuMoi');
ok('phiếu mới gom theo nhóm hàng', pm.nhomHang.length === 3, pm.nhomHang.map(g => g.ten));
ok('tồn kỳ trước ban đầu = 0', pm.nhomHang[0].items[0].tonTruoc === 0);

datGio('2026-08-29T05:00:00Z');
r = await must(tkNV, 'kho.gui', { maCa: 'CA1', items: [
  { maHang: 'H001', nhapThem: 10, thucTe: 8 },
  { maHang: 'H002', nhapThem: 0, thucTe: 4 }        // định mức 10 -> cảnh báo
]});
ok('gửi phiếu kiểm kho thành công', !!r.maPhieu);
ok('cảnh báo hàng dưới định mức', r.canhBao.length === 1, r.canhBao);
ok('ghi 2 dòng kiểm kho', docSheet('KiemKho').length === 2);
ok('hao hụt lần đầu = 0+10-8 = 2',
   Number(docSheet('KiemKho').find(x => x.maHang === 'H001').haoHut) === 2);

datGio('2026-08-29T11:00:00Z');
await must(tkNV, 'kho.gui', { maCa: 'CA2', items: [{ maHang: 'H001', nhapThem: 0, thucTe: 5 }] });
const kk = docSheet('KiemKho').filter(x => x.maHang === 'H001');
const lan2 = kk[kk.length - 1];
ok('lần 2 lấy tồn trước = 8', Number(lan2.tonTruoc) === 8, lan2.tonTruoc);
ok('lần 2 hao hụt = 8+0-5 = 3', Number(lan2.haoHut) === 3, lan2.haoHut);

const khoQL = await must(tkQL, 'ql.kho', { tuNgay: '2026-08-01', denNgay: '2026-08-31' });
const h001 = khoQL.thongKe.find(x => x.maHang === 'H001');
ok('quản lý thấy tổng hao 5', h001.tongHao === 5, h001.tongHao);
ok('quy đổi tiền hao = 5 x 180.000', h001.tienHao === 900000, h001.tienHao);
ok('gộp thành 2 phiếu', khoQL.phieu.length === 2, khoQL.phieu.length);

await must(tkQL, 'ql.luuHang', { maHang: 'H099', tenHang: 'Syrup vải', donVi: 'chai',
                                 nhomHang: 'Nguyên liệu', tonDinhMuc: 3, giaVon: 90000 });
ok('thêm mặt hàng mới', docSheet('DanhMucHang').length === 13);
ok('mã hàng sai định dạng bị từ chối',
   (await api(tkQL, 'ql.luuHang', { maHang: 'x', tenHang: 'Test' })).ok === false);

/* ============ 10. Giao ca ============ */
nhom('10. Giao ca');
datGio('2026-08-29T11:30:00Z');
r = await must(tkNV, 'gc.gui', {
  maCa: 'CA1', tienDauCa: 500000, tongDoanhThu: 3000000, tienChuyenKhoan: 1200000,
  tienMatCuoiCa: 2250000, tienNopVe: 1800000, soHoaDon: 87, maNVNhan: 'QL001',
  tinhTrangThietBi: 'Bình thường', vanDe: ''
});
// kỳ vọng tiền mặt = 500.000 + (3.000.000 − 1.200.000) = 2.300.000 -> thiếu 50.000
ok('tính đúng chênh lệch quỹ -50.000', r.chenhLech === -50000, r.chenhLech);
let gc = docSheet('GiaoCa')[0];
ok('trạng thái chờ xác nhận', gc.trangThai === 'ChoXacNhan');
ok('không tự giao ca cho chính mình',
   (await api(tkNV, 'gc.gui', { maCa: 'CA1', maNVNhan: 'NV001' })).ok === false);

ok('người nhận thấy biên bản chờ xác nhận',
   (await must(tkQL, 'gc.choToiXacNhan')).danhSach.length === 1);
ok('người khác không xác nhận thay được',
   (await api(tkNV, 'gc.xacNhan', { id: gc.id })).ok === false);
await must(tkQL, 'gc.xacNhan', { id: gc.id });
gc = docSheet('GiaoCa')[0];
ok('xác nhận thành công', gc.trangThai === 'DaXacNhan');
ok('không xác nhận hai lần', (await api(tkQL, 'gc.xacNhan', { id: gc.id })).ok === false);

const gcQL = await must(tkQL, 'ql.giaoCa', { tuNgay: '2026-08-01', denNgay: '2026-08-31' });
ok('quản lý tổng hợp doanh thu', gcQL.tong.doanhThu === 3000000, gcQL.tong.doanhThu);
ok('quản lý tổng hợp lệch quỹ', gcQL.tong.chenhLech === -50000, gcQL.tong.chenhLech);

/* ============ 11. Tổng quan ============ */
nhom('11. Tổng quan quản lý');
datGio('2026-08-29T05:30:00Z');
let tq = await must(tkQL, 'ql.tongQuan', {});
ok('đọc được tổng quan', typeof tq.dangLam === 'number');
ok('đếm nhân viên đang làm', tq.soNhanVien === 2, tq.soNhanVien);
ok('cảnh báo hàng dưới định mức', tq.soCanhBaoKho > 0, tq.soCanhBaoKho);
ok('có lương tạm tính tháng', tq.tongLuongTamTinh > 0);

/* ============ 12. Phân quyền ============ */
nhom('12. Phân quyền');
ok('quản lý không tự bỏ quyền của mình',
   (await api(tkQL, 'ql.luuNhanVien', { maNV: 'QL001', hoTen: 'Quản lý', chucVu: 'NhanVien' })).ok === false);
ok('quản lý không tự khoá tài khoản mình',
   (await api(tkQL, 'ql.luuNhanVien', { maNV: 'QL001', hoTen: 'Quản lý', chucVu: 'QuanLy', trangThai: 'NghiViec' })).ok === false);
ok('action lạ bị từ chối', (await api(tkQL, 'ql.xoaSachDuLieu', {})).ok === false);
ok('gọi API không token bị từ chối', (await api(null, 'cc.trangThai', {})).ok === false);

await must(tkQL, 'ql.luuNhanVien', { maNV: 'NV002', hoTen: 'Trần Thị B', chucVu: 'NhanVien',
  luongTheoGio: 28000, phuCapCa: 0, ngayVaoLam: '2026-08-01', trangThai: 'DangLam', pin: '1234' });
ok('thêm nhân viên mới', docSheet('NhanVien').length === 3);
await must(tkQL, 'ql.luuNhanVien', { maNV: 'NV002', hoTen: 'Trần Thị B', chucVu: 'NhanVien',
  luongTheoGio: 28000, phuCapCa: 0, trangThai: 'NghiViec' });
ok('nhân viên nghỉ việc không đăng nhập được',
   (await api(null, 'login', { maNV: 'NV002', pin: '1234' })).ok === false);

/* ============ 12b. Chống dò PIN & ca bỏ quên ============ */
nhom('12b. Chống dò PIN và ca bỏ quên');
for (let i = 0; i < 5; i++) await api(null, 'login', { maNV: 'NV001', pin: '000' + i });
r = await api(null, 'login', { maNV: 'NV001', pin: '778899' });
ok('khoá tạm sau 5 lần sai PIN dù nhập đúng', r.ok === false, r.error);
ok('thông báo hướng dẫn rõ ràng', /5 lần|reset/i.test(r.error), r.error);
boNhoTam.remove('fail_NV001');
ok('hết khoá thì đăng nhập lại được',
   (await api(null, 'login', { maNV: 'NV001', pin: '778899' })).ok === true);
tkNV = (await must(null, 'login', { maNV: 'NV001', pin: '778899' })).token;

datGio('2026-09-01T00:10:00Z');                       // 07:10 VN ngày 1/9
await must(tkNV, 'cc.vao', { maCa: 'CA1', lat: 10.762622, lng: 106.660172 });
datGio('2026-09-02T05:00:00Z');                       // hôm sau
r = await api(tkNV, 'cc.ra', { lat: 10.762622, lng: 106.660172 });
ok('ca quá 18 tiếng bị chặn, bắt báo quản lý',
   r.ok === false && /18 tiếng|quên/.test(r.error), r.error);

datGio('2026-09-03T00:10:00Z');
r = await api(tkNV, 'cc.vao', { maCa: 'CA1', lat: 10.762622, lng: 106.660172 });
ok('ca bỏ quên cũ không chặn ca mới', r.ok === true, r.error);
tq = await must(tkQL, 'ql.tongQuan', {});
ok('tổng quan cảnh báo ca quên chấm ra', tq.quenChamRa === 1, tq.quenChamRa);
ok('"đang trong ca" không đếm ca bỏ quên', tq.dangLam === 1, tq.dangLam);
const dtc = await must(tkQL, 'ql.dangTrongCa');
ok('danh sách trực tuyến gắn cờ ca bỏ quên',
   dtc.danhSach.filter(x => x.boQuen).length === 1, dtc.danhSach.map(x => [x.ngay, x.boQuen]));

const boQuen = (await must(tkQL, 'ql.chamCong', { tuNgay: '2026-09-01', denNgay: '2026-09-01' })).danhSach[0];
await must(tkQL, 'ql.suaChamCong', { id: boQuen.id, gioVao: '07:10', gioRa: '12:00' });
ok('quản lý sửa tay thì đóng được ca bỏ quên',
   docSheet('ChamCong').find(x => x.ngay === '2026-09-01').trangThai === 'HoanThanh');
ok('sau khi sửa, cảnh báo biến mất', (await must(tkQL, 'ql.tongQuan', {})).quenChamRa === 0);

/* ============ 13. Nhật ký & hiệu năng ============ */
nhom('13. Nhật ký & số vòng gọi mạng');
ok('có ghi nhật ký', docSheet('NhatKy').length > 10, docSheet('NhatKy').length);

resetDemGoi();
await must(tkQL, 'ql.tongQuan', {});
const tongGoi = soLanGoi.batchGet + soLanGoi.batchUpdate + soLanGoi.append + soLanGoi.meta;
ok('tổng quan chỉ tốn 1 vòng đọc', soLanGoi.batchGet === 1, soLanGoi);
ok('tổng quan không quá 2 vòng gọi Sheets', tongGoi <= 2, soLanGoi);

resetDemGoi();
datGio('2026-09-03T05:00:00Z');
await must(tkNV, 'cc.ra', { lat: 10.762622, lng: 106.660172 });
ok('chấm công ra chỉ tốn 1 đọc + 1 ghi',
   soLanGoi.batchGet === 1 && soLanGoi.batchUpdate === 1 && soLanGoi.append === 1, soLanGoi);

console.log('\n───────────────');
console.log(dat + ' đạt / ' + hong + ' lỗi');
process.exit(hong ? 1 : 0);
