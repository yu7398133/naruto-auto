// 解码 SECRET_REALM_PREP_ICON_TMPL (JPEG) 的真实尺寸 + 看它的搜索窗是否合理
const fs = require('fs');
const src = fs.readFileSync('C:/Users/chenyu/dsh/火影忍者/naruto-auto.user.js', 'utf8');
const lines = src.split('\n');

// 抓 L5973 起的整条语句（可能跨多行拼接）
let i = lines.findIndex(l => l.includes('const SECRET_REALM_PREP_ICON_TMPL'));
let body = '';
for (let k = i; k < i + 60 && k < lines.length; k++) {
  body += lines[k];
  if (/;\s*$/.test(lines[k].trim())) break;
}
const parts = [...body.matchAll(/"([^"]*)"/g)].map(x => x[1]).concat([...body.matchAll(/'([^']*)'/g)].map(x => x[1]));
let joined = parts.join('').replace(/^data:image\/[a-z]+;base64,/, '').replace(/[^A-Za-z0-9+/=]/g, '');
const buf = Buffer.from(joined, 'base64');
console.log('JPEG bytes: ' + buf.length);

// 解析 JPEG SOF 段拿宽高
let w = null, h = null;
for (let p = 2; p < buf.length - 9;) {
  if (buf[p] !== 0xFF) { p++; continue; }
  const marker = buf[p + 1];
  if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
    h = buf.readUInt16BE(p + 5); w = buf.readUInt16BE(p + 7); break;
  }
  const len = buf.readUInt16BE(p + 2);
  p += 2 + len;
}
console.log('SECRET_REALM_PREP_ICON_TMPL: ' + w + 'x' + h);
console.log('搜索窗 SECRET_REALM_PREP_ICON_REGION = [440, 615, 510, 680] → 窗口 ' + (510-440) + 'x' + (680-615));
console.log('');
console.log('判定：模板尺寸必须 <= 搜索窗尺寸。若模板比窗口还大 → findTemplate 必然扫不到（直接失败）。');
if (w && (w > 510 - 440 || h > 680 - 615)) console.log('  ❌ 模板比搜索窗大 → 结构性错误！');
else console.log('  ✅ 模板尺寸 <= 搜索窗');
