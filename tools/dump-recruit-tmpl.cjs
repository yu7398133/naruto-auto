// 把 userscript 里内嵌的「普通招募」模板抠出来存成 PNG，便于和实机截图对比。
// 用法：node tools/dump-recruit-tmpl.cjs
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'naruto-auto.user.js'), 'utf8');
const m = src.match(/const RECRUIT_TAB_TMPL_SRC = 'data:image\/png;base64,' \+ '([A-Za-z0-9+/=]+)'/);
if (!m) { console.error('没找到 RECRUIT_TAB_TMPL_SRC'); process.exit(1); }
const buf = Buffer.from(m[1], 'base64');
const out = path.join(__dirname, 'recruit-tmpl.png');
fs.writeFileSync(out, buf);
const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
console.log(`模板已导出: ${out}`);
console.log(`尺寸: ${w}x${h}  (注释说 92x26)`);
console.log(`字节: ${buf.length}`);
