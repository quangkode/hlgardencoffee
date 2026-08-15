/* Giả lập tối thiểu môi trường Google Apps Script để chạy thử logic .gs bằng Node */
const crypto = require('crypto');

const TZ_OFFSET_MIN = 7 * 60; // Asia/Ho_Chi_Minh

let _now = new Date('2026-08-15T03:00:00Z'); // 10:00 giờ VN
function setNow(iso) { _now = new Date(iso); }
function nowMs() { return _now.getTime(); }

/* ---- Date có thể điều khiển ---- */
const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(nowMs()); else super(...a); }
  static now() { return nowMs(); }
}

/* ---- Range / Sheet / Spreadsheet ---- */
class Range {
  constructor(sheet, r, c, nr, nc) { this.s = sheet; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
  setValues(v) {
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.s._set(this.r + i, this.c + j, v[i][j]);
    return this;
  }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) row.push(this.s._get(this.r + i, this.c + j));
      out.push(row);
    }
    return out;
  }
  setValue(v) { this.s._set(this.r, this.c, v); return this; }
  getValue() { return this.s._get(this.r, this.c); }
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
  createFilter() { return {}; }
}
class Sheet {
  constructor(name) { this.name = name; this.data = []; this.maxRows = 1000; this.maxCols = 26; }
  _set(r, c, v) {
    while (this.data.length < r) this.data.push([]);
    const row = this.data[r - 1];
    while (row.length < c) row.push('');
    row[c - 1] = v === undefined || v === null ? '' : v;
  }
  _get(r, c) {
    const row = this.data[r - 1];
    if (!row) return '';
    const v = row[c - 1];
    return v === undefined ? '' : v;
  }
  getName() { return this.name; }
  getMaxRows() { return this.maxRows; }
  getLastRow() {
    for (let i = this.data.length; i >= 1; i--) {
      const row = this.data[i - 1] || [];
      if (row.some(c => c !== '' && c !== null && c !== undefined)) return i;
    }
    return 0;
  }
  getRange(r, c, nr, nc) {
    if (nr === undefined) { nr = 1; nc = 1; }
    if (nc === undefined) nc = 1;
    if (c + nc - 1 > this.maxCols) throw new Error('Range vượt quá số cột của sheet ' + this.name);
    if (r + nr - 1 > this.maxRows) throw new Error('Range vượt quá số dòng của sheet ' + this.name);
    return new Range(this, r, c, nr, nc);
  }
  getDataRange() { return this.getRange(1, 1, Math.max(1, this.getLastRow()), this.maxCols); }
  appendRow(vals) {
    const r = this.getLastRow() + 1;
    vals.forEach((v, j) => this._set(r, j + 1, v));
  }
  deleteRow(r) { this.data.splice(r - 1, 1); }
  setFrozenRows() { return this; }
  autoResizeColumns() { return this; }
}
class Spreadsheet {
  constructor(name) { this.name = name; this.sheets = []; this.id = 'SS_' + Math.random().toString(36).slice(2, 10); }
  getId() { return this.id; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
  getSheets() { return this.sheets; }
}

/* ---- Utilities ---- */
function pad(n, w) { return String(n).padStart(w, '0'); }
function vnParts(d) {
  const t = new Date(d.getTime() + TZ_OFFSET_MIN * 60000);
  return {
    y: t.getUTCFullYear(), M: t.getUTCMonth() + 1, d: t.getUTCDate(),
    H: t.getUTCHours(), m: t.getUTCMinutes(), s: t.getUTCSeconds()
  };
}
const Utilities = {
  DigestAlgorithm: { SHA_256: 'SHA-256' },
  Charset: { UTF_8: 'utf8' },
  formatDate(d, tz, fmt) {
    const p = vnParts(d);
    return fmt
      .replace(/yyyy/g, pad(p.y, 4)).replace(/yy/g, pad(p.y % 100, 2))
      .replace(/MM/g, pad(p.M, 2)).replace(/dd/g, pad(p.d, 2))
      .replace(/HH/g, pad(p.H, 2)).replace(/mm/g, pad(p.m, 2)).replace(/ss/g, pad(p.s, 2));
  },
  getUuid() { return crypto.randomUUID(); },
  computeDigest(alg, str) { return Array.from(crypto.createHash('sha256').update(str, 'utf8').digest()); },
  computeHmacSha256Signature(payload, key) {
    return Array.from(crypto.createHmac('sha256', key).update(payload, 'utf8').digest());
  },
  base64Encode(s) { return Buffer.from(s, 'utf8').toString('base64'); },
  base64EncodeWebSafe(s) { return Buffer.from(s, 'utf8').toString('base64url'); },
  base64DecodeWebSafe(s) { return Array.from(Buffer.from(s, 'base64url')); },
  base64Decode(s) { return Array.from(Buffer.from(s, 'base64')); },
  newBlob(bytes) {
    const buf = Buffer.from(bytes);
    return { getDataAsString: () => buf.toString('utf8'), getBytes: () => bytes };
  }
};

/* ---- Dịch vụ khác ---- */
function taoMoiTruong() {
  let activeSS = new Spreadsheet('DATA - test');
  const props = {};
  const cache = {};

  return {
    Date: FakeDate,
    console,
    Utilities,
    SpreadsheetApp: {
      create(n) { activeSS = new Spreadsheet(n); return activeSS; },
      openById(id) { if (activeSS.getId() !== id) throw new Error('Sai ID'); return activeSS; },
      getActiveSpreadsheet() { return activeSS; },
      getUi() { throw new Error('no ui'); }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = String(v); },
        deleteProperty: k => { delete props[k]; }
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get: k => (k in cache ? cache[k] : null),
        put: (k, v) => { cache[k] = String(v); },
        remove: k => { delete cache[k]; }
      })
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Logger: { log: () => {} },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }) },
    DriveApp: {
      getFolderById() { throw new Error('none'); },
      createFolder() { throw new Error('none'); },
      Access: { ANYONE_WITH_LINK: 1 }, Permission: { VIEW: 1 }
    },
    HtmlService: {
      createTemplateFromFile: () => ({ evaluate: () => ({}) }),
      createHtmlOutputFromFile: () => ({ getContent: () => '' }),
      XFrameOptionsMode: { ALLOWALL: 1 }
    },
    _props: props,
    _ss: () => activeSS
  };
}

module.exports = { taoMoiTruong, setNow, nowMs, Utilities };
