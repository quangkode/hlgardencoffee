/*******************************************************
 * sheets-mock.js — Giả lập Google Sheets REST API trong bộ nhớ
 *
 * Chặn global fetch để test chạy đúng đường code thật: ký JWT, gọi
 * batchGet / batchUpdate / append, kể cả phần dồn ghi theo lô.
 * Nhờ vậy lỗi ở lớp ghi dữ liệu cũng bị bắt chứ không chỉ lỗi nghiệp vụ.
 *******************************************************/

import crypto from 'node:crypto';

export const SHEET_ID = 'TEST_SHEET_ID';

/* ---------- Đồng hồ điều khiển được ---------- */

let _now = new Date('2026-08-15T03:00:00Z');   // 10:00 giờ VN
const RealDate = Date;

export function datGio(iso) { _now = new RealDate(iso); }

export function lapDongHo() {
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(_now.getTime()); else super(...a); }
    static now() { return _now.getTime(); }
  }
  globalThis.Date = FakeDate;
}

/* ---------- Bảng tính trong bộ nhớ ---------- */

const bang = new Map();          // ten -> { id, rows: [[...]] }
let nextId = 100;

export function resetBangTinh() {
  bang.clear();
  nextId = 100;
}

export function docThoBang(ten) {
  return (bang.get(ten)?.rows || []).map(r => r.slice());
}

/** Đọc một sheet thành mảng object theo dòng tiêu đề. */
export function docSheet(ten) {
  const rows = bang.get(ten)?.rows || [];
  if (!rows.length) return [];
  const head = rows[0];
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (!r.some(c => c !== '' && c !== null && c !== undefined)) continue;
    const o = { _row: i + 1 };
    head.forEach((h, j) => { o[h] = r[j] === undefined ? '' : r[j]; });
    out.push(o);
  }
  return out;
}

export function soSheet() { return bang.size; }
export function tenCacSheet() { return [...bang.keys()]; }

/* ---------- Phân tích ký hiệu A1 ---------- */

function soCot(a1) {                    // A -> 1, AA -> 27
  let n = 0;
  for (const c of a1) n = n * 26 + (c.charCodeAt(0) - 64);
  return n;
}

function tachRange(range) {
  const i = range.indexOf('!');
  if (i < 0) return { ten: range, tuDong: null };
  const ten = range.slice(0, i);
  const phan = range.slice(i + 1);
  const m = phan.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
  if (!m) return { ten, tuDong: null };
  return {
    ten,
    tuDong: parseInt(m[2], 10),
    tuCot: soCot(m[1]),
    denDong: m[4] ? parseInt(m[4], 10) : parseInt(m[2], 10),
    denCot: m[3] ? soCot(m[3]) : soCot(m[1])
  };
}

function datO(sh, dong, cot, v) {
  while (sh.rows.length < dong) sh.rows.push([]);
  const r = sh.rows[dong - 1];
  while (r.length < cot) r.push('');
  r[cot - 1] = v === undefined || v === null ? '' : v;
}

function dongCuoi(sh) {
  for (let i = sh.rows.length; i >= 1; i--) {
    const r = sh.rows[i - 1] || [];
    if (r.some(c => c !== '' && c !== null && c !== undefined)) return i;
  }
  return 0;
}

/* ---------- Bộ định tuyến giả ---------- */

function json(data, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    text: () => Promise.resolve(JSON.stringify(data)),
    json: () => Promise.resolve(data)
  });
}

export let soLanGoi = { token: 0, batchGet: 0, batchUpdate: 0, append: 0, meta: 0 };
export function resetDemGoi() { soLanGoi = { token: 0, batchGet: 0, batchUpdate: 0, append: 0, meta: 0 }; }

export function lapFetch() {
  globalThis.fetch = async (url, opt = {}) => {
    url = String(url);

    /* Đổi JWT lấy access token */
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      soLanGoi.token++;
      const body = String(opt.body || '');
      if (!body.includes('assertion=')) return json({ error: 'invalid_grant' }, 400);
      return json({ access_token: 'fake-token', expires_in: 3600 });
    }

    if (!url.startsWith('https://sheets.googleapis.com/v4/spreadsheets/' + SHEET_ID)) {
      return json({ error: { message: 'URL lạ: ' + url } }, 404);
    }
    if (!(opt.headers || {}).Authorization?.startsWith('Bearer ')) {
      return json({ error: { message: 'Thiếu Authorization' } }, 401);
    }

    const duoi = url.slice(('https://sheets.googleapis.com/v4/spreadsheets/' + SHEET_ID).length);
    const than = opt.body ? JSON.parse(opt.body) : null;

    /* Siêu dữ liệu sheet */
    if (duoi.startsWith('?fields=sheets.properties')) {
      soLanGoi.meta++;
      return json({
        sheets: [...bang.entries()].map(([title, v]) => ({ properties: { sheetId: v.id, title } }))
      });
    }

    /* batchGet nhiều dải */
    if (duoi.startsWith('/values:batchGet')) {
      soLanGoi.batchGet++;
      const ranges = [...new URL('https://x' + duoi).searchParams.getAll('ranges')];
      const thieu = ranges.find(r => !bang.has(tachRange(r).ten));
      if (thieu) {
        return json({ error: { message: 'Unable to parse range: ' + thieu } }, 400);
      }
      return json({
        valueRanges: ranges.map(r => ({ range: r, values: docThoBang(tachRange(r).ten) }))
      });
    }

    /* Ghi nhiều ô */
    if (duoi.startsWith('/values:batchUpdate')) {
      soLanGoi.batchUpdate++;
      for (const d of than.data) {
        const t = tachRange(d.range);
        const sh = bang.get(t.ten);
        if (!sh) return json({ error: { message: 'Không có sheet ' + t.ten } }, 400);
        d.values.forEach((hang, i) => {
          hang.forEach((v, j) => datO(sh, t.tuDong + i, t.tuCot + j, v));
        });
      }
      return json({ totalUpdatedCells: 1 });
    }

    /* Thêm dòng vào cuối */
    if (duoi.includes(':append')) {
      soLanGoi.append++;
      const range = decodeURIComponent(duoi.slice(duoi.indexOf('/values/') + 8).split(':append')[0]);
      const sh = bang.get(tachRange(range).ten);
      if (!sh) return json({ error: { message: 'Không có sheet' } }, 400);
      let dong = dongCuoi(sh);
      than.values.forEach(hang => {
        dong++;
        hang.forEach((v, j) => datO(sh, dong, j + 1, v));
      });
      return json({ updates: { updatedRows: than.values.length } });
    }

    /* Tạo sheet / xoá dòng */
    if (duoi.startsWith(':batchUpdate')) {
      soLanGoi.batchUpdate++;
      for (const req of than.requests) {
        if (req.addSheet) {
          const t = req.addSheet.properties.title;
          if (!bang.has(t)) bang.set(t, { id: nextId++, rows: [] });
        }
        if (req.deleteDimension) {
          const { sheetId, startIndex, endIndex } = req.deleteDimension.range;
          const ten = [...bang.entries()].find(([, v]) => v.id === sheetId)?.[0];
          if (ten) bang.get(ten).rows.splice(startIndex, endIndex - startIndex);
        }
      }
      return json({ replies: [] });
    }

    return json({ error: { message: 'Không hỗ trợ: ' + duoi } }, 400);
  };
}

/* ---------- Biến môi trường giả ---------- */

export function lapMoiTruong() {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.GOOGLE_SHEET_ID = SHEET_ID;
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'test@test.iam.gserviceaccount.com';
  process.env.GOOGLE_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
  process.env.PIN_PEPPER = 'pepper-cho-kiem-thu';
  process.env.TOKEN_SECRET = 'secret-cho-kiem-thu';
}
