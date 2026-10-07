// 在「招募页」截图上定位普通招募文字，并重新抠出模板。
// 结论依据：vision 量到 1920x1080 下 普通招募 ≈ (55,980)-(210,1022)。
// 用法：node tools/make-recruit-tmpl.cjs <shot.png>
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function decodePNG(buf) {
  let off = 8, W = 0, H = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { W = data.readUInt32BE(0); H = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; interlace = data[12]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = W * bpp;
  const img = Buffer.alloc(H * stride);
  let p = 0;
  for (let y = 0; y < H; y++) {
    const ft = raw[p++]; const line = raw.subarray(p, p + stride); p += stride;
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
  return { W, H, bpp, stride, img };
}

const dec = decodePNG(fs.readFileSync(process.argv[2]));
console.log(`原图 ${dec.W}x${dec.H}`);
const px = (x, y) => { const i = y * dec.stride + x * dec.bpp; return [dec.img[i], dec.img[i + 1], dec.img[i + 2]]; };
const luma = ([r, g, b]) => (r * 77 + g * 151 + b * 28) >> 8;
const isWhite = (c) => { const mx = Math.max(...c), mn = Math.min(...c); return luma(c) > 170 && (mx - mn) < 70; };

// 在左侧栏（1920 空间 x∈[40,330]）逐行统计白像素，看普通招募这一行在哪
console.log('\n=== 左侧栏白像素按行（只打印有内容的行段） ===');
const rows = [];
for (let y = 0; y < dec.H; y++) {
  let n = 0;
  for (let x = 40; x < 330; x++) if (isWhite(px(x, y))) n++;
  rows.push(n);
}
let y = 0;
while (y < dec.H) {
  if (rows[y] >= 6) {
    let y0 = y, peak = 0;
    while (y < dec.H && rows[y] >= 2) { peak = Math.max(peak, rows[y]); y++; }
    console.log(`  行段 y∈[${y0},${y - 1}]  高=${y - y0}  峰值=${peak}`);
  } else y++;
}

// 打印普通招募附近（y 960~1040）的横向白像素分布，找文字左右边界
console.log('\n=== y∈[970,1030] 的横向白像素（x 每 10px 汇总） ===');
for (let x0 = 40; x0 < 340; x0 += 10) {
  let n = 0;
  for (let x = x0; x < x0 + 10; x++) for (let y = 970; y < 1030; y++) if (isWhite(px(x, y))) n++;
  if (n > 0) console.log(`  x∈[${x0},${x0 + 9}]: ${n}`);
}
