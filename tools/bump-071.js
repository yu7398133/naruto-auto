// 版本号 0.6.70 -> 0.6.71（同时改 @version 和 const VERSION）
const fs = require('fs');
const F = 'naruto-auto.user.js';
let s = fs.readFileSync(F, 'utf8');
const OLD = '0.6.70', NEW = '0.6.71';

const n1 = (s.match(/\/\/ @version\s+0\.6\.70/) || []).length;
const n2 = (s.match(/const VERSION = '0\.6\.70'/) || []).length;
if (n1 !== 1 || n2 !== 1) {
  console.error(`定位失败：@version 命中 ${n1}，VERSION 命中 ${n2}（各应为 1）`);
  process.exit(1);
}
s = s.replace(/\/\/ @version\s+0\.6\.70/, `// @version      ${NEW}`);
s = s.replace(/const VERSION = '0\.6\.70'/, `const VERSION = '${NEW}'`);
fs.writeFileSync(F, s);

// 复查
const t = fs.readFileSync(F, 'utf8');
const a = (t.match(new RegExp(`// @version\\s+${NEW.replace(/\./g, '\\.')}`)) || []).length;
const b = (t.match(new RegExp(`const VERSION = '${NEW.replace(/\./g, '\\.')}'`)) || []).length;
console.log(`${OLD} -> ${NEW}：@version=${a} VERSION=${b}`);
process.exit(a === 1 && b === 1 ? 0 : 1);
