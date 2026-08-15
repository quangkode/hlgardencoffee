const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = process.argv[2];
let loi = 0;

for (const f of fs.readdirSync(dir)) {
  const p = path.join(dir, f);
  const raw = fs.readFileSync(p, 'utf8');

  if (f.endsWith('.gs')) {
    try { new vm.Script(raw, { filename: f }); console.log('OK   ' + f); }
    catch (e) { loi++; console.log('LOI  ' + f + ' :: ' + e.message); }
  } else if (f.endsWith('.html')) {
    const blocks = [...raw.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
    if (!blocks.length) { console.log('--   ' + f + ' (khong co script)'); continue; }
    blocks.forEach((b, i) => {
      try { new vm.Script(b[1], { filename: f + '#' + i }); console.log('OK   ' + f + ' script[' + i + ']'); }
      catch (e) { loi++; console.log('LOI  ' + f + ' script[' + i + '] :: ' + e.message); }
    });
  } else if (f.endsWith('.json')) {
    try { JSON.parse(raw); console.log('OK   ' + f); }
    catch (e) { loi++; console.log('LOI  ' + f + ' :: ' + e.message); }
  }
}
console.log(loi ? '\n==> ' + loi + ' loi' : '\n==> Tat ca hop le');
process.exit(loi ? 1 : 0);
