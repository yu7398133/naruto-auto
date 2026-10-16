// 版本号递增器：同步改 // @version 与 const VERSION，并断言各命中 1 次。
// 用法：node tools/bump-version.js 0.6.72
const fs = require('fs');
const path = require('path');

const to = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(to || '')) {
  console.error('用法：node tools/bump-version.js <x.y.z>');
  process.exit(1);
}
const file = path.join(__dirname, '..', 'naruto-auto.user.js');
let s = fs.readFileSync(file, 'utf8');

const cur = (s.match(/\/\/ @version\s+(\d+\.\d+\.\d+)/) || [])[1];
if (!cur) { console.error('!! 找不到 // @version'); process.exit(1); }
if (cur === to) { console.log('已是 ' + to + '，无需改动'); process.exit(0); }

const count = (re) => (s.match(re) || []).length;
// ⚠ @version 行有多余空格（`// @version      0.6.71`），必须用 \s+ 匹配
const a0 = count(new RegExp('// @version\\s+' + cur.replace(/\./g, '\\.'), 'g'));
const b0 = count(new RegExp("const VERSION = '" + cur.replace(/\./g, '\\.') + "'", 'g'));
if (a0 !== 1 || b0 !== 1) {
  console.error(`!! ${cur} 命中数异常：@version=${a0} VERSION=${b0}（应各为 1）`);
  process.exit(1);
}

s = s.replace(new RegExp('// @version\\s+' + cur.replace(/\./g, '\\.')), '// @version      ' + to)
     .replace("const VERSION = '" + cur + "'", "const VERSION = '" + to + "'");
fs.writeFileSync(file, s);

const a1 = count(new RegExp('// @version\\s+' + to.replace(/\./g, '\\.'), 'g'));
const b1 = count(new RegExp("const VERSION = '" + to.replace(/\./g, '\\.') + "'", 'g'));
if (a1 !== 1 || b1 !== 1) {
  console.error(`!! 写回后校验失败：@version=${a1} VERSION=${b1}`);
  process.exit(1);
}
console.log(`${cur} -> ${to}：@version=${a1} VERSION=${b1}`);
