// 从 trace HTML 里抽出 4 张帧图存成 png，便于看清每步在哪个界面
const fs = require('fs'); const path = require('path');
const src = process.argv[2];
const outDir = process.argv[3] || path.join(__dirname, '..', 'trace-frames');
fs.mkdirSync(outDir, { recursive: true });
const html = fs.readFileSync(src, 'utf8');
const re = /data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)/g;
let m, i = 0;
while ((m = re.exec(html)) !== null) {
  i++;
  const ext = m[1] === 'jpeg' ? 'jpg' : 'png';
  const p = path.join(outDir, `step${i}.${ext}`);
  fs.writeFileSync(p, Buffer.from(m[2], 'base64'));
  console.log(`${i}: ${p}  (${Buffer.from(m[2], 'base64').length} bytes)`);
}
console.log('共 ' + i + ' 帧');
