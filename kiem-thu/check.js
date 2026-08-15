/*******************************************************
 * check.js — Kiểm tra cú pháp mọi file trước khi deploy
 * Chạy:  node kiem-thu/check.js
 *******************************************************/

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const GOC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let loi = 0;

function bao(dat, nhan, chiTiet) {
  if (dat) console.log('  ✓ ' + nhan);
  else { loi++; console.log('  ✗ ' + nhan + (chiTiet ? ' :: ' + chiTiet : '')); }
}

/* --- 1. Các module ESM phía máy chủ --- */
console.log('\n1. Mã phía máy chủ');
const moduleJs = [
  'api/index.js', 'api/_lib/core.js', 'api/_lib/auth.js',
  'api/_lib/setup.js', 'api/_lib/business.js'
];
for (const f of moduleJs) {
  const p = path.join(GOC, f);
  if (!fs.existsSync(p)) { bao(false, f, 'không tìm thấy'); continue; }
  try {
    new vm.SourceTextModule(fs.readFileSync(p, 'utf8'), { identifier: f });
    bao(true, f);
  } catch (e) {
    // SourceTextModule cần cờ --experimental-vm-modules; nếu không có thì import thật
    try { await import('file://' + p.replace(/\\/g, '/')); bao(true, f + ' (nạp được)'); }
    catch (e2) { bao(false, f, e2.message); }
  }
}

/* --- 2. Giao diện --- */
console.log('\n2. Giao diện');
const html = fs.readFileSync(path.join(GOC, 'index.html'), 'utf8');
const khoi = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
bao(khoi.length === 3, 'index.html có đủ 3 khối script', 'thấy ' + khoi.length);
khoi.forEach((b, i) => {
  try { new vm.Script(b[1]); bao(true, 'script[' + i + '] hợp lệ (' + b[1].split('\n').length + ' dòng)'); }
  catch (e) { bao(false, 'script[' + i + ']', e.message); }
});
const conSot = ['google.script.run', '<?!=', '<?=']. filter(k => html.includes(k));
bao(conSot.length === 0, 'không còn phụ thuộc Apps Script', conSot.join(', '));

/* --- 3. Cấu hình --- */
console.log('\n3. Cấu hình');
for (const f of ['package.json', 'vercel.json']) {
  try { JSON.parse(fs.readFileSync(path.join(GOC, f), 'utf8')); bao(true, f); }
  catch (e) { bao(false, f, e.message); }
}
const pkg = JSON.parse(fs.readFileSync(path.join(GOC, 'package.json'), 'utf8'));
bao(pkg.type === 'module', 'package.json khai báo ESM');
bao(!pkg.dependencies, 'không có thư viện phụ thuộc');
bao(fs.existsSync(path.join(GOC, '.vercelignore')), 'có .vercelignore');

/* --- 4. Đối chiếu action client gọi và máy chủ khai báo --- */
console.log('\n4. Đối chiếu API');
const router = fs.readFileSync(path.join(GOC, 'api/index.js'), 'utf8');
const bang = router.slice(router.indexOf('const THAO_TAC'), router.indexOf('/* ================= Khởi tạo'));
const khaiBao = new Set([...bang.matchAll(/^\s*'([\w.]+)':/gm)].map(m => m[1]));
const goi = new Set([...html.matchAll(/\bapi(?:An)?\(\s*'([\w.]+)'/g)].map(m => m[1]));
const thieu = [...goi].filter(a => !khaiBao.has(a));
bao(thieu.length === 0, 'mọi action client gọi đều có ở máy chủ', thieu.join(', '));
console.log('     máy chủ khai báo ' + khaiBao.size + ' action, giao diện dùng ' + goi.size);

console.log(loi ? '\n==> ' + loi + ' lỗi\n' : '\n==> Tất cả hợp lệ\n');
process.exit(loi ? 1 : 0);
