const fs = require('fs');
const p = 'naruto-auto.user.js';
let s = fs.readFileSync(p, 'utf8');
const before = s;
s = s.replace('// @version      0.6.63', '// @version      0.6.64');
s = s.replace("const VERSION = '0.6.63';", "const VERSION = '0.6.64';");
if (s === before) { console.error('未发生替换，请检查版本号'); process.exit(1); }
fs.writeFileSync(p, s);
console.log('版本已升到 0.6.64');
