/*******************************************************
 * setup.js — Khởi tạo dữ liệu mẫu lần đầu
 *
 * Sheet rỗng thì tự điền cài đặt mặc định, ca làm việc, danh mục hàng
 * và tài khoản quản lý đầu tiên. Chạy tự động ở lượt gọi API đầu tiên,
 * và chỉ điền phần nào còn thiếu nên gọi lại nhiều lần vẫn an toàn.
 *******************************************************/

import { SHEETS, readAll_, appendMany_, today_ } from './core.js';
import { taoNhanVien_ } from './auth.js';

export const CAI_DAT_MAC_DINH = [
  ['tenQuan',              'Cà Phê Chị Thảo', 'Tên quán hiển thị trên app'],
  ['diaChiQuan',           '',                'Địa chỉ quán'],
  ['latQuan',              '',                'Vĩ độ quán — vào Cài đặt bấm "Lấy vị trí hiện tại" khi đang đứng ở quán'],
  ['lngQuan',              '',                'Kinh độ quán'],
  ['banKinhChamCong',      '150',             'Bán kính cho phép chấm công (mét). 0 = không kiểm tra vị trí'],
  ['batBuocViTri',         'TRUE',            'TRUE = bắt buộc bật GPS mới chấm công được'],
  ['chanNgoaiVung',        'FALSE',           'TRUE = chặn hẳn nếu đứng ngoài bán kính. FALSE = vẫn cho chấm nhưng gắn cờ đỏ'],
  ['phutTreChoPhep',       '5',               'Trễ quá bao nhiêu phút thì hiện cảnh báo cho quản lý (không trừ tiền)'],
  ['luongGioMacDinh',      '25000',           'Lương/giờ mặc định khi nhân viên chưa được set riêng'],
  ['phuCapCaMacDinh',      '0',               'Phụ cấp thêm mỗi ca làm đủ (đồng). Để 0 = chỉ tính lương theo giờ'],
  ['nguongPhutTinhPhuCap', '240',             'Làm tối thiểu bao nhiêu phút thì được tính phụ cấp ca'],
  ['lamTronPhut',          '0',               'Làm tròn số phút công theo bội số này (0 = không làm tròn)'],
  ['choPhepTuDangKyCa',    'TRUE',            'TRUE = nhân viên tự báo ca, quản lý duyệt'],
  ['hanBaoCaTruoc',        '1',               'Phải báo ca trước ít nhất bao nhiêu ngày'],
  ['batBuocKiemKhoCuoiCa', 'FALSE',           'TRUE = nhắc kiểm kho trước khi chấm công ra'],
  ['thoiGianPhienDangNhap','720',             'Số phút giữ đăng nhập (720 = 12 tiếng)']
];

const CA_MAC_DINH = [
  ['CA1', 'Ca sáng',  '06:00', '12:00', 0,  'HoatDong', ''],
  ['CA2', 'Ca chiều', '12:00', '18:00', 0,  'HoatDong', ''],
  ['CA3', 'Ca tối',   '18:00', '23:00', 0,  'HoatDong', ''],
  ['CAG', 'Ca gãy',   '09:00', '14:00', 30, 'HoatDong', 'Ca linh hoạt, nghỉ giữa ca 30 phút']
];

const HANG_MAC_DINH = [
  ['H001', 'Cà phê hạt',     'kg',   'Nguyên liệu', 5,   180000, 'HoatDong'],
  ['H002', 'Sữa đặc',        'lon',  'Nguyên liệu', 10,  22000,  'HoatDong'],
  ['H003', 'Sữa tươi',       'hộp',  'Nguyên liệu', 12,  32000,  'HoatDong'],
  ['H004', 'Đường',          'kg',   'Nguyên liệu', 5,   20000,  'HoatDong'],
  ['H005', 'Trà đen',        'kg',   'Nguyên liệu', 2,   150000, 'HoatDong'],
  ['H006', 'Đá viên',        'bao',  'Nguyên liệu', 6,   15000,  'HoatDong'],
  ['H007', 'Ly nhựa size M', 'cái',  'Vật tư',      200, 900,    'HoatDong'],
  ['H008', 'Ly nhựa size L', 'cái',  'Vật tư',      200, 1200,   'HoatDong'],
  ['H009', 'Nắp ly',         'cái',  'Vật tư',      300, 400,    'HoatDong'],
  ['H010', 'Ống hút',        'cái',  'Vật tư',      300, 200,    'HoatDong'],
  ['H011', 'Bánh ngọt',      'cái',  'Hàng bán',    15,  12000,  'HoatDong'],
  ['H012', 'Nước suối',      'chai', 'Hàng bán',    24,  4000,   'HoatDong']
];

/** Các sheet cần nạp để chạy được hàm seed. */
export const SHEET_CAN_CHO_SETUP = [
  SHEETS.CAIDAT, SHEETS.CA, SHEETS.HANG, SHEETS.NHANVIEN
];

/** Điền dữ liệu còn thiếu. Trả về mô tả những gì đã tạo. */
export function seed_() {
  const daTao = [];

  const daCo = new Set(readAll_(SHEETS.CAIDAT).map(r => String(r.key).trim()));
  const themCaiDat = CAI_DAT_MAC_DINH
    .filter(r => !daCo.has(r[0]))
    .map(r => ({ key: r[0], value: r[1], moTa: r[2] }));
  if (themCaiDat.length) {
    appendMany_(SHEETS.CAIDAT, themCaiDat);
    daTao.push(themCaiDat.length + ' cài đặt');
  }

  if (readAll_(SHEETS.CA).length === 0) {
    appendMany_(SHEETS.CA, CA_MAC_DINH.map(r => ({
      maCa: r[0], tenCa: r[1], gioBatDau: r[2], gioKetThuc: r[3],
      soPhutNghi: r[4], trangThai: r[5], ghiChu: r[6]
    })));
    daTao.push('4 ca làm việc');
  }

  if (readAll_(SHEETS.HANG).length === 0) {
    appendMany_(SHEETS.HANG, HANG_MAC_DINH.map(r => ({
      maHang: r[0], tenHang: r[1], donVi: r[2], nhomHang: r[3],
      tonDinhMuc: r[4], giaVon: r[5], trangThai: r[6]
    })));
    daTao.push('12 mặt hàng mẫu');
  }

  if (readAll_(SHEETS.NHANVIEN).length === 0) {
    taoNhanVien_({
      maNV: 'QL001', hoTen: 'Quản lý', chucVu: 'QuanLy',
      luongTheoGio: 0, phuCapCa: 0, ngayVaoLam: today_(), ghiChu: 'Tài khoản khởi tạo'
    }, '1234');
    taoNhanVien_({
      maNV: 'NV001', hoTen: 'Nhân viên mẫu', chucVu: 'NhanVien',
      luongTheoGio: 25000, phuCapCa: 0, ngayVaoLam: today_(), ghiChu: 'Xoá được'
    }, '1234');
    daTao.push('tài khoản QL001 và NV001 (PIN 1234)');
  }

  return daTao;
}
