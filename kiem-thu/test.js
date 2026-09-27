/*******************************************************
 * test.js — Kiểm thử toàn bộ nghiệp vụ trên bản Vercel
 *
 * Chạy:  node kiem-thu/test.js
 * Gọi thẳng vào handler API thật, qua lớp Google Sheets giả lập,
 * nên bao gồm cả xác thực, phân quyền và phần ghi dữ liệu theo lô.
 *******************************************************/

import { utils as xlsxUtils, write as xlsxWrite } from 'xlsx';
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
ok('tạo đủ 12 sheet', tenCacSheet().length === 12, tenCacSheet());
ok('có sheet ChamCong', tenCacSheet().includes('ChamCong'));
ok('seed 15 cài đặt', docSheet('CaiDat').length === 15, docSheet('CaiDat').length);
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
  chanNgoaiVung: 'FALSE',
  luongGioMacDinh: '25000', phuCapCaMacDinh: '0', nguongPhutTinhPhuCap: '240',
  lamTronPhut: '0', thoiGianPhienDangNhap: '999999'
}});
tkQL = (await must(null, 'login', { maNV: 'QL001', pin: '246813' })).token;
tkNV = (await must(null, 'login', { maNV: 'NV001', pin: '778899' })).token;
ok('lưu và đọc lại được toạ độ quán', caiDat('latQuan') === '10.762622');
ok('không tạo dòng cài đặt trùng', docSheet('CaiDat').length === 15, docSheet('CaiDat').length);

/* ============ 4. Chấm công ============ */
nhom('4. Chấm công vào / ra');
datGio('2026-08-17T00:10:00Z');                       // 07:10 VN
r = await api(tkNV, 'cc.vao', { maCa: 'CA1', lat: 10.762622, lng: 106.660172 });
ok('chấm vào thành công', r.ok === true, r.error);
let cc = docSheet('ChamCong')[0];
ok('ghi đúng giờ vào 07:10', cc.gioVao === '07:10', cc.gioVao);
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
   17/8 CA1 07:10–12:05 = 295' -> 147.500
   17/8 CA2 12:10–18:05 = 355' -> 177.500
   18/8 CAD 22:00–02:00 = 240' -> 120.000
   25/8 CA1 07:00–12:00 = 300' -> 150.000
                lương ca      = 595.000                              */
ok('đếm đúng 4 ca', L.soCa === 4, L.soCa);
ok('tổng phút công = 1190', L.tongPhutLam === 1190, L.tongPhutLam);
ok('lương ca = 595.000', L.luongCa === 595000, L.luongCa);
ok('ca đêm KHÔNG được nhân hệ số',
   L.chiTiet.find(c => c.maCa === 'CAD').tienCa === 120000);
ok('không có phụ cấp khi để 0', L.phuCap === 0, L.phuCap);
ok('không có trường theo dõi đi trễ', L.soLanTre === undefined && L.tongPhutTre === undefined);
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

// Duyệt phiếu kiểm kho để tồn được cập nhật
await must(tkQL, 'ql.duyetKiemKho', { id: r.maPhieu, duyet: true });

datGio('2026-08-29T11:00:00Z');
const r2kho = await must(tkNV, 'kho.gui', { maCa: 'CA2', items: [{ maHang: 'H001', nhapThem: 0, thucTe: 5 }] });
const kk = docSheet('KiemKho').filter(x => x.maHang === 'H001');
const lan2 = kk[kk.length - 1];
ok('lần 2 lấy tồn trước = 8', Number(lan2.tonTruoc) === 8, lan2.tonTruoc);
ok('lần 2 hao hụt = 8+0-5 = 3', Number(lan2.haoHut) === 3, lan2.haoHut);

// Duyệt phiếu lần 2
await must(tkQL, 'ql.duyetKiemKho', { id: r2kho.maPhieu, duyet: true });

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

/* ============ 14. Nhập kho từ file Excel ============ */
nhom('14. Nhập kho từ file Excel');

function trongThieuTV_(...cot) {
  const r = new Array(12).fill('');
  cot.forEach((v, i) => { r[i] = v; });
  return r;
}
const HANG_HEAD = ['', 'Đơn vị tính', 'Số lượng', 'Đơn giá', 'Thành tiền',
                    'Số lượng', 'Đơn giá', 'Thành tiền', 'Số lượng', 'Đơn giá', 'Thành tiền', 'Số lượng'];
function trangKhoExcel_(items) {
  return [
    new Array(12).fill(''),
    trongThieuTV_('Tên thực phẩm', 'Kho', '', '', '', 'Nhập', '', '', 'Xuất', '', '', 'Tồn cuối ngày'),
    new Array(12).fill(''),
    HANG_HEAD,
    ...items,
    trongThieuTV_('Tổng')
  ];
}

const wbExcel = xlsxUtils.book_new();
xlsxUtils.book_append_sheet(wbExcel, xlsxUtils.aoa_to_sheet(trangKhoExcel_([
  trongThieuTV_('Sữa tươi', 'hộp', 5, 29000, 145000, 10, 30000, 300000, 3, 29000, 87000, 12),
  trongThieuTV_('Bột Matcha Test', 'Gói', '', 0, 0, 2, 120000, 240000, '', '', 0, 2)
])), '10-8');
xlsxUtils.book_append_sheet(wbExcel, xlsxUtils.aoa_to_sheet(trangKhoExcel_([
  trongThieuTV_('Sữa tươi', 'hộp', 12, 29000, 348000, '', '', 0, 2, 29000, 58000, 10),
  trongThieuTV_('Bột Matcha Test', 'Gói', 2, 120000, 240000, '', '', 0, '', '', 0, 2),
  trongThieuTV_('Trân châu đen Test', 'Gói', '', 0, 0, 5, 48000, 240000, '', '', 0, 5)
])), '11-8');
xlsxUtils.book_append_sheet(wbExcel, xlsxUtils.aoa_to_sheet([['ghi chú tự do, không phải ngày']]), 'GhiChu');
const fileBase64 = xlsxWrite(wbExcel, { type: 'base64', bookType: 'xlsx' });

const soHangTruoc = docSheet('DanhMucHang').length;
const soKhoTruoc = docSheet('KiemKho').length;

let xemTruoc = await must(tkQL, 'ql.nhapKhoExcel', { fileBase64 });
ok('đọc đúng 2 ngày hợp lệ', xemTruoc.soNgay === 2, xemTruoc.soNgay);
ok('khoảng ngày đúng 2026-08-10 → 2026-08-11',
   xemTruoc.tuNgay === '2026-08-10' && xemTruoc.denNgay === '2026-08-11', xemTruoc);
ok('đếm đúng 5 dòng kiểm kho', xemTruoc.soDong === 5, xemTruoc.soDong);
ok('nhận diện đúng 2 mặt hàng mới', xemTruoc.soHangMoi === 2, xemTruoc.tenHangMoi);
ok('báo bỏ qua sheet "GhiChu"', xemTruoc.sheetBoQua.includes('GhiChu'), xemTruoc.sheetBoQua);
ok('xem trước KHÔNG ghi gì vào danh mục', docSheet('DanhMucHang').length === soHangTruoc);
ok('xem trước KHÔNG ghi gì vào kiểm kho', docSheet('KiemKho').length === soKhoTruoc);

const kq = await must(tkQL, 'ql.nhapKhoExcel', { fileBase64, xacNhan: true });
ok('nhập thành công', kq.soDong === 5 && kq.soHangMoi === 2, kq);
ok('tạo đúng 2 mặt hàng mới trong danh mục',
   docSheet('DanhMucHang').length === soHangTruoc + 2, docSheet('DanhMucHang').length);
ok('không tạo trùng mặt hàng đã có (Sữa tươi)',
   docSheet('DanhMucHang').filter(x => x.tenHang === 'Sữa tươi').length === 1);
ok('ghi đúng 5 dòng kiểm kho mới',
   docSheet('KiemKho').length === soKhoTruoc + 5, docSheet('KiemKho').length);

const dong10 = docSheet('KiemKho').filter(x => x.ngay === '2026-08-10');
const suaTuoi10 = dong10.find(x => x.tenHang === 'Sữa tươi');
ok('ngày 10-8 lấy đúng tồn trước/nhập/thực tế của Sữa tươi',
   Number(suaTuoi10.tonTruoc) === 5 && Number(suaTuoi10.nhapThem) === 10 && Number(suaTuoi10.thucTe) === 12,
   suaTuoi10);
ok('hao hụt tính đúng 5+10-12=3', Number(suaTuoi10.haoHut) === 3, suaTuoi10.haoHut);

const matcha10 = dong10.find(x => x.tenHang === 'Bột Matcha Test');
const hangMatcha = docSheet('DanhMucHang').find(x => x.tenHang === 'Bột Matcha Test');
ok('mặt hàng mới lấy đơn giá từ cột Nhập khi cột Kho = 0',
   Number(hangMatcha.giaVon) === 120000, hangMatcha.giaVon);
ok('mặt hàng mới thuộc nhóm "Nhập từ Excel"', hangMatcha.nhomHang === 'Nhập từ Excel');

const dong11 = docSheet('KiemKho').filter(x => x.ngay === '2026-08-11');
ok('ngày 11-8 có đủ 3 mặt hàng (kể cả mặt hàng mới xuất hiện)', dong11.length === 3, dong11.length);
ok('cùng mã hàng Bột Matcha Test dùng lại giữa 2 ngày',
   dong10.find(x => x.tenHang === 'Bột Matcha Test').maHang ===
   dong11.find(x => x.tenHang === 'Bột Matcha Test').maHang);

ok('quản lý xem lại được qua ql.kho',
   (await must(tkQL, 'ql.kho', { tuNgay: '2026-08-01', denNgay: '2026-08-31' })).phieu.length >= 2);

const soKhoSauLan1 = docSheet('KiemKho').length;
const xemTruocLan2 = await must(tkQL, 'ql.nhapKhoExcel', { fileBase64 });
ok('nhập lại đúng file cũ → báo cả 2 ngày đã nhập trước đó',
   xemTruocLan2.ngayTrungLap.length === 2, xemTruocLan2.ngayTrungLap);
ok('nhập lại đúng file cũ, xem trước không lấy dòng nào', xemTruocLan2.soDong === 0, xemTruocLan2);
ok('xác nhận lại đúng file cũ bị chặn, không tạo dữ liệu trùng',
   (await api(tkQL, 'ql.nhapKhoExcel', { fileBase64, xacNhan: true })).ok === false);
ok('kiểm kho KHÔNG bị nhân đôi sau khi nhập trùng file',
   docSheet('KiemKho').length === soKhoSauLan1, docSheet('KiemKho').length);

ok('nhân viên không gọi được API nhập Excel',
   (await api(tkNV, 'ql.nhapKhoExcel', { fileBase64 })).ok === false);
ok('file rác bị từ chối với thông báo rõ ràng',
   (await api(tkQL, 'ql.nhapKhoExcel', { fileBase64: 'khong-phai-file-excel' })).ok === false);

/* ============ 15. Tự động chia ca ============ */
nhom('15. Tự động chia ca');

// Kích hoạt lại NV002 (đã cho nghỉ việc ở mục 12) để có người thứ hai đăng ký ca
await must(tkQL, 'ql.luuNhanVien', { maNV: 'NV002', hoTen: 'Trần Thị B', chucVu: 'NhanVien',
  luongTheoGio: 28000, phuCapCa: 0, trangThai: 'DangLam' });
await must(tkQL, 'ql.resetPin', { maNV: 'NV002', pin: '1234' });
let tkNV2 = (await must(null, 'login', { maNV: 'NV002', pin: '1234' })).token;
tkNV2 = (await must(tkNV2, 'doiPin', { pinCu: '1234', pinMoi: '135790', pinMoiNhapLai: '135790' })).token;

// Cấu hình số người cần mỗi ngày: CA1 cần 1, CA2 cần 2, CA3 không giới hạn
const dsCaHienTai = (await must(tkQL, 'ql.docCaiDat')).dsCa;
function luuLaiCa_(maCa, soNguoiCan) {
  const c = dsCaHienTai.find(x => x.maCa === maCa);
  return must(tkQL, 'ql.luuCa', { ...c, soNguoiCan });
}
await luuLaiCa_('CA1', 1);
await luuLaiCa_('CA2', 2);
await luuLaiCa_('CA3', 0);
ok('lưu số người cần CA1 = 1', caiDat('soNguoiCanCa_CA1') === '1', caiDat('soNguoiCanCa_CA1'));
ok('lưu số người cần CA2 = 2', caiDat('soNguoiCanCa_CA2') === '2', caiDat('soNguoiCanCa_CA2'));
ok('lưu số người cần CA3 = 0 (không giới hạn)', caiDat('soNguoiCanCa_CA3') === '0', caiDat('soNguoiCanCa_CA3'));
ok('ql.docCaiDat trả lại đúng số người cần đã lưu',
   (await must(tkQL, 'ql.docCaiDat')).dsCa.find(x => x.maCa === 'CA2').soNguoiCan === 2);

datGio('2026-09-10T01:00:00Z');   // hôm nay 10/9 (Thứ Năm)

// NV002 đã được xếp sẵn 1 ca trong tuần 14–20/9 -> phải được ưu tiên thấp hơn khi tranh chỗ
await must(tkQL, 'ql.xepCa', { items: [{ maNV: 'NV002', ngay: '2026-09-14', maCa: 'CA3' }] });

// 2 người cùng báo ca CA1 ngày 15/9 (chỉ cần 1 người) -> phải chọn người đang ít ca hơn (NV001)
await must(tkNV, 'ca.baoCa', { items: [{ ngay: '2026-09-15', maCa: 'CA1' }] });
await must(tkNV2, 'ca.baoCa', { items: [{ ngay: '2026-09-15', maCa: 'CA1' }] });

// Chỉ 1 người báo ca CA2 ngày 16/9 (cần 2 người) -> thiếu người nhưng vẫn được chọn
await must(tkNV, 'ca.baoCa', { items: [{ ngay: '2026-09-16', maCa: 'CA2' }] });

// 2 người cùng báo ca CA3 ngày 16/9 (không giới hạn) -> cả 2 đều được chọn
await must(tkNV, 'ca.baoCa', { items: [{ ngay: '2026-09-16', maCa: 'CA3' }] });
await must(tkNV2, 'ca.baoCa', { items: [{ ngay: '2026-09-16', maCa: 'CA3' }] });

const goiY = await must(tkQL, 'ql.goiYChiaCa', { tuNgay: '2026-09-14', denNgay: '2026-09-16' });
const nhomCA1 = goiY.danhSach.find(g => g.ngay === '2026-09-15' && g.maCa === 'CA1');
const nhomCA2 = goiY.danhSach.find(g => g.ngay === '2026-09-16' && g.maCa === 'CA2');
const nhomCA3 = goiY.danhSach.find(g => g.ngay === '2026-09-16' && g.maCa === 'CA3');

ok('CA1 15/9: đúng 1 chỗ, 2 người đăng ký', nhomCA1.can === 1 && nhomCA1.soDangKy === 2, nhomCA1);
ok('CA1 15/9: ưu tiên người đang ít ca hơn (NV001) được chọn',
   nhomCA1.chon.length === 1 && nhomCA1.chon[0].maNV === 'NV001', nhomCA1);
ok('CA1 15/9: NV002 (đã có 1 ca tuần này) không được chọn',
   nhomCA1.khongChon.length === 1 && nhomCA1.khongChon[0].maNV === 'NV002', nhomCA1);

ok('CA2 16/9: cần 2 người nhưng mới 1 đăng ký -> vẫn chọn, không loại ai',
   nhomCA2.can === 2 && nhomCA2.soDangKy === 1 && nhomCA2.chon.length === 1 && nhomCA2.khongChon.length === 0, nhomCA2);
ok('có cảnh báo thiếu người cho CA2 16/9',
   goiY.canhBaoThieu.some(s => s.includes('2026-09-16') && s.includes('1/2')), goiY.canhBaoThieu);

ok('CA3 16/9: không giới hạn -> cả 2 người đều được chọn',
   nhomCA3.can === null && nhomCA3.chon.length === 2 && nhomCA3.khongChon.length === 0, nhomCA3);

const idsChon = [...nhomCA1.chon, ...nhomCA2.chon, ...nhomCA3.chon].map(x => x.id);
const idsTuChoi = [...nhomCA1.khongChon, ...nhomCA2.khongChon, ...nhomCA3.khongChon].map(x => x.id);
await must(tkQL, 'ql.apDungChiaCa', { idsChon, idsTuChoi });

const lichSau = docSheet('LichLamViec');
const rowNV001CA1 = lichSau.find(x => x.maNV === 'NV001' && x.ngay === '2026-09-15' && x.maCa === 'CA1');
const rowNV002CA1 = lichSau.find(x => x.maNV === 'NV002' && x.ngay === '2026-09-15' && x.maCa === 'CA1');
ok('áp dụng: NV001 được duyệt ca CA1 15/9', rowNV001CA1.trangThai === 'DaDuyet', rowNV001CA1);
ok('áp dụng: NV002 bị từ chối ca CA1 15/9', rowNV002CA1.trangThai === 'TuChoi', rowNV002CA1);
ok('áp dụng: có ghi chú lý do từ chối', /không chọn|đủ người/.test(rowNV002CA1.ghiChuQL), rowNV002CA1.ghiChuQL);

const rowNV001CA2 = lichSau.find(x => x.maNV === 'NV001' && x.ngay === '2026-09-16' && x.maCa === 'CA2');
ok('áp dụng: NV001 vẫn được duyệt dù CA2 16/9 thiếu người', rowNV001CA2.trangThai === 'DaDuyet', rowNV001CA2);

const lichCuoi = await must(tkQL, 'ql.lichCa', { tuNgay: '2026-09-14', denNgay: '2026-09-16' });
ok('không còn ca nào chờ duyệt trong khoảng đã áp dụng',
   lichCuoi.danhSach.filter(x => x.trangThai === 'ChoDuyet').length === 0, lichCuoi.danhSach);

ok('áp dụng mà không chọn/từ chối gì thì báo lỗi',
   (await api(tkQL, 'ql.apDungChiaCa', {})).ok === false);
ok('nhân viên không gọi được API gợi ý chia ca',
   (await api(tkNV, 'ql.goiYChiaCa', { tuNgay: '2026-09-14', denNgay: '2026-09-16' })).ok === false);

/* ============ 16. Sửa lỗi "tồn trước" & xoá mặt hàng ============ */
nhom('16. Tồn chỉ đổi khi phiếu được duyệt, và xoá mặt hàng');

// H004 (Đường) chưa ai đụng tới trước đó trong bộ test này -> tồn trước = 0
datGio('2026-09-20T00:00:00Z');
let pKho1 = await must(tkNV, 'kho.gui', { maCa: 'CA1', items: [{ maHang: 'H004', nhapThem: 0, thucTe: 20 }] });
ok('phiếu 1: tồn trước = 0 (chưa từng kiểm)',
   Number(docSheet('KiemKho').find(x => x.id === pKho1.maPhieu).tonTruoc) === 0);

const hangH004 = pm2 => pm2.nhomHang.flatMap(g => g.items).find(x => x.maHang === 'H004');
ok('phiếu 1 chưa duyệt -> tồn hiện tại vẫn là 0', hangH004(await must(tkNV, 'kho.phieuMoi')).tonTruoc === 0);
await must(tkQL, 'ql.duyetKiemKho', { id: pKho1.maPhieu, duyet: true });
ok('duyệt phiếu 1 -> tồn hiện tại = 20', hangH004(await must(tkNV, 'kho.phieuMoi')).tonTruoc === 20);

datGio('2026-09-20T00:05:00Z');
let pKho2 = await must(tkNV, 'kho.gui', { maCa: 'CA1', items: [{ maHang: 'H004', nhapThem: 0, thucTe: 15 }] });
const dong2 = docSheet('KiemKho').find(x => x.id === pKho2.maPhieu);
ok('phiếu 2: tồn trước = 20 (của phiếu 1 đã duyệt)', Number(dong2.tonTruoc) === 20, dong2.tonTruoc);

// Quản lý từ chối phiếu 2 (huỷ, coi như chưa từng xảy ra)
await must(tkQL, 'ql.duyetKiemKho', { id: pKho2.maPhieu, duyet: false });

// Kiểm tiếp phiếu 3 -> phải quay lại lấy tồn trước = 20 (của phiếu 1, phiếu 2 đã bị từ chối
// nên không được tính, dù phiếu 2 mới hơn về thời gian)
datGio('2026-09-20T00:10:00Z');
let pKho3 = await must(tkNV, 'kho.gui', { maCa: 'CA1', items: [{ maHang: 'H004', nhapThem: 0, thucTe: 18 }] });
const dong3 = docSheet('KiemKho').find(x => x.id === pKho3.maPhieu);
ok('phiếu 3: bỏ qua phiếu 2 đã bị từ chối, tồn trước quay lại = 20', Number(dong3.tonTruoc) === 20, dong3.tonTruoc);

// Báo cáo hao hụt của quản lý: phiếu bị từ chối (phiếu 2, hao=5) không được tính vào tổng hao,
// nhưng vẫn phải còn hiển thị trong danh sách phiếu để quản lý xem lại lịch sử.
const khoQL2 = await must(tkQL, 'ql.kho', { tuNgay: '2026-09-20', denNgay: '2026-09-20' });
const tkH004 = khoQL2.thongKe.find(x => x.maHang === 'H004');
ok('tổng hao H004 bỏ qua phiếu bị từ chối: -20+2=-18', tkH004.tongHao === -18, tkH004.tongHao);
ok('số lần kiểm H004 chỉ đếm 2 phiếu hợp lệ (bỏ phiếu bị từ chối)', tkH004.soLanKiem === 2, tkH004.soLanKiem);
ok('phiếu bị từ chối vẫn còn trong danh sách phiếu để xem lại',
   khoQL2.phieu.some(p => p.id === pKho2.maPhieu && p.trangThaiDuyet === 'TuChoi'), khoQL2.phieu.map(p => p.id));

// Danh mục hàng: xoá được, lịch sử kiểm kho cũ vẫn còn nguyên
const soHangTruocXoa = docSheet('DanhMucHang').length;
const rXoa = await must(tkQL, 'ql.xoaHang', { maHang: 'H004' });
ok('xoá mặt hàng báo đúng số lần đã kiểm', /3 lần/.test(rXoa.thongBao), rXoa.thongBao);
ok('xoá khỏi danh mục', docSheet('DanhMucHang').length === soHangTruocXoa - 1);
ok('không xoá được lần 2 (đã xoá rồi)', (await api(tkQL, 'ql.xoaHang', { maHang: 'H004' })).ok === false);
ok('lịch sử kiểm kho cũ của H004 vẫn còn nguyên', docSheet('KiemKho').filter(x => x.maHang === 'H004').length === 3);
ok('nhân viên không gọi được API xoá mặt hàng',
   (await api(tkNV, 'ql.xoaHang', { maHang: 'H001' })).ok === false);

/* ============ 17. Nhập / xuất kho (sheet NhapXuatKho) ============ */
nhom('17. Nhập / xuất kho');
const hangH005 = async () => (await must(tkNV, 'kho.phieuMoi')).nhomHang.flatMap(g => g.items).find(x => x.maHang === 'H005');

datGio('2026-09-21T00:00:00Z');
const kk5 = await must(tkNV, 'kho.gui', { maCa: 'CA1', items: [{ maHang: 'H005', nhapThem: 0, thucTe: 10 }] });
await must(tkQL, 'ql.duyetKiemKho', { id: kk5.maPhieu, duyet: true });
ok('kiểm kho ban đầu H005 = 10', (await hangH005()).tonTruoc === 10);

datGio('2026-09-21T01:00:00Z');
const pNhap = await must(tkNV, 'kho.nhapXuat', { loai: 'Nhap', maCa: 'CA1', items: [{ maHang: 'H005', soLuong: 5 }] });
let dongNX = docSheet('NhapXuatKho').filter(x => x.id === pNhap.maPhieu);
ok('phiếu nhập được ghi vào sheet NhapXuatKho', dongNX.length === 1 && dongNX[0].loai === 'Nhap', dongNX);
ok('phiếu nhập ở trạng thái chờ duyệt', dongNX[0].trangThaiDuyet === 'ChoDuyet');
let h5 = await hangH005();
ok('chưa duyệt -> tồn chưa đổi (10), hiện chờ nhập 5', h5.tonTruoc === 10 && h5.choNhap === 5, h5);
ok('nhân viên không tự duyệt được phiếu nhập',
   (await api(tkNV, 'ql.duyetNhapXuat', { id: pNhap.maPhieu, duyet: true })).ok === false);

await must(tkQL, 'ql.duyetNhapXuat', { id: pNhap.maPhieu, duyet: true });
dongNX = docSheet('NhapXuatKho').filter(x => x.id === pNhap.maPhieu);
ok('duyệt nhập -> tồn = 15', (await hangH005()).tonTruoc === 15);
ok('sheet ghi tồn trước 10 / tồn sau 15', Number(dongNX[0].tonTruoc) === 10 && Number(dongNX[0].tonSau) === 15, dongNX[0]);
ok('không duyệt lại lần 2 được', (await api(tkQL, 'ql.duyetNhapXuat', { id: pNhap.maPhieu, duyet: true })).ok === false);

datGio('2026-09-21T02:00:00Z');
ok('xuất quá tồn bị chặn', (await api(tkNV, 'kho.nhapXuat', { loai: 'Xuat', items: [{ maHang: 'H005', soLuong: 20 }] })).ok === false);
const pXuat = await must(tkNV, 'kho.nhapXuat', { loai: 'Xuat', maCa: 'CA2', items: [{ maHang: 'H005', soLuong: 4 }] });
ok('xuất khi đang có 4 chờ xuất: chỉ còn 11 được xuất -> xuất 12 bị chặn',
   (await api(tkNV, 'kho.nhapXuat', { loai: 'Xuat', items: [{ maHang: 'H005', soLuong: 12 }] })).ok === false);
h5 = await hangH005();
ok('chưa duyệt xuất -> tồn vẫn 15, chờ xuất 4', h5.tonTruoc === 15 && h5.choXuat === 4, h5);

const pXuat2 = await must(tkNV, 'kho.nhapXuat', { loai: 'Xuat', items: [{ maHang: 'H005', soLuong: 1 }] });
await must(tkQL, 'ql.duyetNhapXuat', { id: pXuat2.maPhieu, duyet: false });
ok('phiếu xuất bị từ chối không trừ tồn', (await hangH005()).tonTruoc === 15);

await must(tkQL, 'ql.duyetNhapXuat', { id: pXuat.maPhieu, duyet: true });
ok('duyệt xuất -> tồn = 11', (await hangH005()).tonTruoc === 11);

datGio('2026-09-21T10:00:00Z');
const kk5b = await must(tkNV, 'kho.gui', { maCa: 'CA3', items: [{ maHang: 'H005', nhapThem: 0, thucTe: 11 }] });
const dongKK5b = docSheet('KiemKho').find(x => x.id === kk5b.maPhieu);
ok('kiểm cuối ngày: tồn trước = 11 và hao = 0 (xuất kho KHÔNG bị tính là hao hụt)',
   Number(dongKK5b.tonTruoc) === 11 && Number(dongKK5b.haoHut) === 0, dongKK5b);
await must(tkQL, 'ql.duyetKiemKho', { id: kk5b.maPhieu, duyet: true });

// Nhập đã duyệt nhưng diễn ra TRƯỚC lần kiểm mới nhất thì đã nằm trong số đếm, không cộng lần 2
ok('tồn sau lần kiểm mới = đúng số đếm 11', (await hangH005()).tonTruoc === 11);

const khoQL3 = await must(tkQL, 'ql.kho', { tuNgay: '2026-09-21', denNgay: '2026-09-21' });
const tk5 = khoQL3.thongKe.find(x => x.maHang === 'H005');
ok('báo cáo: tổng nhập 5, tổng xuất 4 (chỉ tính phiếu đã duyệt)', tk5.tongNhap === 5 && tk5.tongXuat === 4, tk5);
ok('báo cáo có danh sách phiếu nhập/xuất (3 phiếu)', khoQL3.phieuNX.length === 3, khoQL3.phieuNX.length);
ok('nhân viên xem lịch sử thấy phiếu nhập/xuất',
   (await must(tkNV, 'kho.lichSu', { tuNgay: '2026-09-21', denNgay: '2026-09-21' })).phieuNX.length === 3);

console.log('\n───────────────');
console.log(dat + ' đạt / ' + hong + ' lỗi');
process.exit(hong ? 1 : 0);
