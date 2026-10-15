// 直接打印按钮行上的真实像素，用眼睛+数值定位，而不是靠猜阈值。
const fs = require('fs'), path = require('path'), zlib = require('zlib');
function decodePNG(buf) {
  let p = 8, w = 0, h = 0, bd = 0, ct = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
    else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break;
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : 1;
  const stride = w * ch, out = Buffer.alloc(w * h * 3);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) { out[(y * w + x) * 3] = cur[x * ch]; out[(y * w + x) * 3 + 1] = cur[x * ch + 1]; out[(y * w + x) * 3 + 2] = cur[x * ch + 2]; }
    prev = cur;
  }
  return { w, h, data: out };
}
const P = (img, x, y) => { const i = (y * img.w + x) * 3; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
const dir = path.join(__dirname, 'zc');
const A = decodePNG(fs.readFileSync(path.join(dir, 'free.png')));
const B = decodePNG(fs.readFileSync(path.join(dir, 'zhaocai.png')));

// 沿 y=848（差异峰值行）横扫，每 20px 打印 A/B 的颜色
console.log('=== y=848 横扫 (每20px)  A=免费一次 B=招财 ===');
for (let x = 600; x < 1600; x += 20) {
  const a = P(A, x, 848), b = P(B, x, 848);
  const mark = (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) ? '  <= DIFF' : '';
  console.log(`  x=${String(x).padStart(4)}  A(${String(a[0]).padStart(3)},${String(a[1]).padStart(3)},${String(a[2]).padStart(3)})  B(${String(b[0]).padStart(3)},${String(b[1]).padStart(3)},${String(b[2]).padStart(3)})${mark}`);
}

// y=848 上差异最大的 x 段
console.log('\n=== y=848 逐像素差异段 ===');
let s = null; const segs = [];
for (let x = 600; x < 1600; x++) {
  const a = P(A, x, 848), b = P(B, x, 848);
  const d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  if (d > 60) { if (s === null) s = x; } else { if (s !== null) { segs.push([s, x - 1]); s = null; } }
}
if (s !== null) segs.push([s, 1599]);
console.log(JSON.stringify(segs.filter(g => g[1] - g[0] > 3)));
