// 量「第 X 回」回合指示器的颜色/亮度，为探针定区域与判据。
// 用法：node tools/measure-round-badge.cjs <shot.png>
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
console.log(`原图 ${dec.W}x${dec.H}\n`);

// vision 量到 1920 空间: 第 3 回 在 x∈[900,1042] y∈[28,96]
const BOX = { x1: 900, y1: 28, x2: 1042, y2: 96 };
console.log(`=== 「第 3 回」区域（1920）x∈[${BOX.x1},${BOX.x2}] y∈[${BOX.y1},${BOX.y2}] ===`);
// 红色像素占比（回合指示器是红色书法字）
let n = 0, red = 0, bright = 0, s = 0;
for (let y = BOX.y1; y < BOX.y2; y++) {
  for (let x = BOX.x1; x < BOX.x2; x++) {
    const c = px(x, y); const [r, g, b] = c;
    n++; s += L(c);
    if (r > 90 && r - g > 30 && r - b > 30) red++;
    if (L(c) > 150) bright++;
  }
}
console.log(`  红色像素占比: ${(red / n * 100).toFixed(1)}%   亮像素(>150): ${(bright / n * 100).toFixed(1)}%   平均亮度: ${Math.round(s / n)}`);

// 对比：屏幕其它区域（背景）的红色占比，看分离度
function regionStat(name, x1, y1, x2, y2) {
  let n2 = 0, red2 = 0, s2 = 0;
  for (let y = y1; y < y2; y += 2) for (let x = x1; x < x2; x += 2) {
    const c = px(x, y); n2++; s2 += L(c);
    if (c[0] > 90 && c[0] - c[1] > 30 && c[0] - c[2] > 30) red2++;
  }
  console.log(`  ${name.padEnd(22)} 红=${(red2 / n2 * 100).toFixed(1)}%  平均亮度=${Math.round(s2 / n2)}`);
}
console.log('\n=== 对照区（同高、左右两侧，应无红字）===');
regionStat('左侧同高 (600-880)', 600, 28, 880, 96);
regionStat('右侧同高 (1062-1340)', 1062, 28, 1340, 96);
regionStat('上方 y=0-25', 900, 0, 1042, 25);
regionStat('下方 y=100-170', 900, 100, 1042, 170);

// 换算 1280 空间
console.log('\n=== 1280 空间（÷1.5）===');
console.log(`  x∈[${(BOX.x1 / 1.5).toFixed(0)},${(BOX.x2 / 1.5).toFixed(0)}]  y∈[${(BOX.y1 / 1.5).toFixed(0)},${(BOX.y2 / 1.5).toFixed(0)}]`);
