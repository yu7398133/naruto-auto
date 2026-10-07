// 无依赖解码 PNG（仅支持 8-bit RGB/RGBA，非隔行）→ 量亮度网格。
// 用途：量「忍术奖励面板」截图的变暗遮罩范围与亮度。
// 用法：node tools/png-luma.cjs <png> [gridX] [gridY]
const fs = require('fs');
const zlib = require('zlib');

const file = process.argv[2];
const GX = +(process.argv[3] || 16), GY = +(process.argv[4] || 9);
const buf = fs.readFileSync(file);

if (buf.readUInt32BE(0) !== 0x89504e47) { console.error('不是 PNG'); process.exit(1); }
let off = 8, W = 0, H = 0, bitDepth = 0, colorType = 0, interlace = 0;
const idat = [];
while (off < buf.length) {
  const len = buf.readUInt32BE(off);
  const type = buf.toString('ascii', off + 4, off + 8);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 'IHDR') {
    W = data.readUInt32BE(0); H = data.readUInt32BE(4);
    bitDepth = data[8]; colorType = data[9]; interlace = data[12];
  } else if (type === 'IDAT') idat.push(data);
  else if (type === 'IEND') break;
  off += 12 + len;
}
if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
  console.error(`不支持的 PNG: depth=${bitDepth} color=${colorType} interlace=${interlace}`); process.exit(1);
}
const bpp = colorType === 6 ? 4 : 3;
const raw = zlib.inflateSync(Buffer.concat(idat));
const stride = W * bpp;
const img = Buffer.alloc(H * stride);
let p = 0;
for (let y = 0; y < H; y++) {
  const ft = raw[p++];
  const line = raw.subarray(p, p + stride); p += stride;
  const prev = y > 0 ? img.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
  const cur = img.subarray(y * stride, (y + 1) * stride);
  for (let x = 0; x < stride; x++) {
    const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
    let v = line[x];
    if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
    else if (ft === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
    cur[x] = v & 255;
  }
}
const luma = (x, y) => { const i = y * stride + x * bpp; return (img[i] * 77 + img[i + 1] * 151 + img[i + 2] * 28) >> 8; };
const px = (x, y) => { const i = y * stride + x * bpp; return [img[i], img[i + 1], img[i + 2]]; };

console.log(`尺寸 ${W}x${H}  colorType=${colorType}`);
console.log(`\n=== 亮度网格 ${GX}x${GY} ===`);
console.log('     ' + Array.from({ length: GX }, (_, i) => String(i).padStart(5)).join(''));
const grid = [];
for (let gy = 0; gy < GY; gy++) {
  const row = [];
  for (let gx = 0; gx < GX; gx++) {
    const x0 = Math.floor(gx * W / GX), x1 = Math.floor((gx + 1) * W / GX);
    const y0 = Math.floor(gy * H / GY), y1 = Math.floor((gy + 1) * H / GY);
    let s = 0, n = 0;
    for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) { s += luma(x, y); n++; }
    row.push(Math.round(s / n));
  }
  grid.push(row);
  console.log(String(gy).padStart(3) + '  ' + row.map(v => String(v).padStart(5)).join(''));
}
console.log('\n=== 四角 rgb/luma ===');
for (const [k, x, y] of [['tl', .02, .05], ['tr', .98, .05], ['bl', .02, .95], ['br', .98, .95], ['ml', .01, .5], ['mr', .99, .5]]) {
  const xx = Math.round(W * x), yy = Math.round(H * y);
  const c = px(xx, yy);
  console.log(`  ${k} (${xx},${yy}) rgb(${c.join(',')}) luma=${luma(xx, yy)}`);
}
