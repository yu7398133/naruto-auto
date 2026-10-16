// 版本号 0.6.69 → 0.6.70
const fs = require('fs');
const P = 'naruto-auto.user.js';
const FROM = '0.6.69', TO = '0.6.70';
let s = fs.readFileSync(P, 'utf8');
const before = s;
s = s.replace('// @version      ' + FROM, '// @version      ' + TO);
s = s.replace("const VERSION = '" + FROM + "'", "const VERSION = '" + TO + "'");
if (s === before) { console.log('NO-REPLACE'); process.exit(1); }
fs.writeFileSync(P, s);
const a = fs.readFileSync(P, 'utf8');
const hasA = a.includes('// @version      ' + TO);
const hasB = a.includes("const VERSION = '" + TO + "'");
console.log('@version -> ' + TO + ': ' + hasA);
console.log('const VERSION -> ' + TO + ': ' + hasB);
if (!hasA || !hasB) { console.log('SYNC-FAIL'); process.exit(1); }
