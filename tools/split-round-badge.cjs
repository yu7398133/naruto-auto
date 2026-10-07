// 在「第 3 回」区域里逐列统计"亮/红"像素，定位「第」「3」「回」三个字的分界。
// 用法：node tools/split-round-badge.cjs <shot.png>
const fs = require('fs');
const zlib = require('zlib');

function decodePNG(buf) {
  let off = 8, W = 0, H = 0, bd = 0, ct = 0, il = 0; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), t = buf.toString('ascii', off + 4, off + 8);
    const d = buf.subarray(off + 8, off + 8 + len);
    if (t === 'IHDR') { W = d.readUInt32BE(0); H = d.readUInt32BE(4); bd = d[8]; ct = d[9]; il = d[12]; }
    else if (t === 'IDAT') idat.push(d);
    else if (t === 'IEND') break;
    off += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = W * bpp, img = Buffer.alloc(H * stride);
  let p = 0;
  for (let y = 0; y < H; y++) {
    const ft = raw[p++], line = raw.subarray(p, p + stride); p += stride;
    const prev = y > 0 ? img.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = img.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, bb = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (ft === 1) v += a; else if (ft === 2) v += bb; else if (ft === 3) v += (a + bb) >> 1;
      else if (ft === 4) { const pa = Math.abs(bb - c), pb = Math.abs(a - c), pc = Math.abs(a + bb - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? bb : c); }
      cur[x] = v & 255;
    }
  }
  return { W, H, bpp, stride, img };
}
const dec = decodePNG(fs.readFileSync(process.argv[2]));
const px = (x, y) => { const i = y * dec.stride + x * dec.bpp; return [dec.img[i], dec.img[i + 1], dec.img[i + 2]]; };
const L = (c) => (c[0] * 77 + c[1] * 151 + c[2] * 28) >> 8;

// 区域（1920）: x∈[900,1042] y∈[28,96]
const Y0 = 28, Y1 = 96, X0 = 890, X1 = 1055;
console.log(`区域（1920）: x∈[${X0},${X1}]  y∈[${Y0},${Y1}]\n`);
console.log('列号(1920) 粗体列数  ← 找字的左右边界');
const cols = [];
for (let x = X0; x < X1; x++) {
  let ink = 0;   // "笔画"像素：白色数字 或 高饱和红字
  for (let y = Y0; y < Y1; y++) {
    const c = px(x, y); const l = L(c);
    const isWhite = l > 165;
    const isRedInk = c[0] > 110 && c[0] - c[1] > 45 && c[0] - c[2] > 45 && l < 150;
    if (isWhite || isRedInk) ink++;
  }
  cols.push(ink);
}
// 打印成紧凑的分段（连续有墨的列段）
let i = 0;
const segs = [];
while (i < cols.length) {
  if (cols[i] >= 3) {
    const s = i;
    let peak = 0;
    while (i < cols.length && cols[i] >= 1) { peak = Math.max(peak, cols[i]); i++; }
    segs.push({ x0: X0 + s, x1: X0 + i - 1, peak });
  } else i++;
}
console.log('\n墨迹列段（应能看出 3 个字的边界）:');
for (const s of segs) console.log(`  x∈[${s.x0},${s.x1}]  宽=${s.x1 - s.x0 + 1}  峰值=${s.peak}`);
console.log('\n（第 1 段 = 「第」，中间 = 数字，最后 = 「回」）');
console.log('\n1280 空间换算（÷1.5）:');
for (const s of segs) console.log(`  x∈[${(s.x0 / 1.5).toFixed(0)},${(s.x1 / 1.5).toFixed(0)}]  宽=${((s.x1 - s.x0 + 1) / 1.5).toFixed(0)}`);
