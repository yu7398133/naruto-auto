// 审查脚本里【所有】base64 模板的原始尺寸，判断哪些是在 1920 空间抠的（=有 scale bug）
const fs = require('fs');
const src = fs.readFileSync('C:/Users/chenyu/dsh/火影忍者/naruto-auto.user.js', 'utf8');
const lines = src.split('\n');

// 找出所有 data:image/png;base64, 常量所在的变量名
const found = [];
lines.forEach((l, i) => {
  const m = l.match(/([A-Z0-9_]+_SRC)\s*=\s*'data:image\/png;base64,([A-Za-z0-9+/=]+)'/);
  if (m) found.push({ line: i + 1, name: m[1], b64: m[2] });
});
console.log('找到 ' + found.length + ' 个 base64 模板常量:');
for (const f of found) {
  const buf = Buffer.from(f.b64, 'base64');
  // 解析 PNG IHDR 宽高
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  console.log(`  L${f.line}  ${f.name}  ${w}x${h}  ${buf.length}B`);
}
