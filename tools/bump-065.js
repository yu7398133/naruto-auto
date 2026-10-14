const fs = require('fs');
const p = 'naruto-auto.user.js';
let s = fs.readFileSync(p, 'utf8');
const before = s;
s = s.replace('// @version      0.6.64', '// @version      0.6.65');
s = s.replace("const VERSION = '0.6.64';", "const VERSION = '0.6.65';");
if (s === before) { console.error('NO-REPLACE'); process.exit(1); }
fs.writeFileSync(p, s);
console.log('VERSION -> 0.6.65');
