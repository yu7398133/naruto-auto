// 解码脚本里全部模板常量（含多行拼接），报告尺寸，判断哪些是 1920 空间抠的
const fs = require('fs');
const src = fs.readFileSync('C:/Users/chenyu/dsh/火影忍者/naruto-auto.user.js', 'utf8');

// 匹配形如: const NAME = 'data:image/png;base64,' + '....' + '....';
const re = /const\s+([A-Z0-9_]+(?:TMPL|SRC|TEMPLATE)[A-Z0-9_]*)\s*=\s*((?:'data:image\/[a-z]+;base64,[^']*'|'[A-Za-z0-9+/=]{20,}'|\s*\+\s*)+);/g;
let m, rows = [];
while ((m = re.exec(src)) !== null) {
  const name = m[1];
  const body = m[2];
  // 抽出所有字符串字面量并拼接
  const parts = [...body.matchAll(/'([^']*)'/g)].map(x => x[1]);
  let joined = parts.join('');
  joined = joined.replace(/^data:image\/[a-z]+;base64,/, '');
  // 去掉非 base64 字符
  joined = joined.replace(/[^A-Za-z0-9+/=]/g, '');
  if (joined.length < 40) { rows.push({ name, size: '??', note: 'too short' }); continue; }
  const buf = Buffer.from(joined, 'base64');
  let w = '?', h = '?';
  if (buf.length > 24 && buf.toString('ascii', 12, 16) === 'IHDR') {
    w = buf.readUInt32BE(16); h = buf.readUInt32BE(20);
  } else if (buf[0] === 0xFF && buf[1] === 0xD8) { w = 'JPEG'; h = 'JPEG'; }
  rows.push({ name, size: w + 'x' + h, bytes: buf.length, line: src.slice(0, m.index).split('\n').length });
}
console.log('共 ' + rows.length + ' 个模板常量:');
console.log('');
for (const r of rows) {
  console.log(`  ${r.name.padEnd(32)} ${String(r.size).padEnd(10)} ${r.bytes || ''}B   L${r.line || '?'}`);
}
console.log('');
console.log('说明：脚本 vision canvas = 1280x720。');
console.log('      WIDTH 接近 1920 或宽高比例=16:9 者，极可能是在 1920 空间抠的 → 需缩放。');
