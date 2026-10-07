// 量「忍术奖励面板」截图：把当前 5 个探针区的实际亮度打出来，
// 并扫描整幅图的亮度网格，找出真正"变暗"的区域应放在哪。
// 用法：node tools/diag-arena-panel.cjs <shot.png>
const fs = require('fs');
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
const S = 1.5;   // 1920 → 1280
const px = (x, y) => { const i = y * dec.stride + x * dec.bpp; return [dec.img[i], dec.img[i + 1], dec.img[i + 2]]; };
const L = (c) => (c[0] * 77 + c[1] * 151 + c[2] * 28) >> 8;

// 当前脚本里的 5 块探针区（1280 空间）
const AREAS = [
  [10, 30, 120, 100], [1160, 30, 1270, 100], [10, 620, 120, 700],
  [10, 300, 60, 450], [1220, 300, 1270, 450],
];
const NAMES = ['左上', '右上', '左下', '左中', '右中'];
console.log('\n=== 当前 5 块探针区的实测亮度（1280 空间）===');
AREAS.forEach((a, i) => {
  const x0 = Math.round(a[0] * S), x1 = Math.round(a[2] * S);
  const y0 = Math.round(a[1] * S), y1 = Math.round(a[3] * S);
  let s = 0, n = 0;
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { s += L(px(x, y)); n++; }
  const avg = Math.round(s / n);
  console.log(`  ${NAMES[i]}  [${a}]  → 实测亮度 ${avg}  ${avg <= 80 ? '暗' : '亮 ← 拖后腿'}`);
});

// 整图亮度网格（找真正暗的带）
console.log('\n=== 整图亮度网格 16x9（找暗带）===');
const GX = 16, GY = 9;
console.log('      ' + Array.from({ length: GX }, (_, i) => String(i).padStart(5)).join(''));
for (let gy = 0; gy < GY; gy++) {
  const row = [];
  for (let gx = 0; gx < GX; gx++) {
    const x0 = Math.floor(gx * dec.W / GX), x1 = Math.floor((gx + 1) * dec.W / GX);
    const y0 = Math.floor(gy * dec.H / GY), y1 = Math.floor((gy + 1) * dec.H / GY);
    let s = 0, n = 0;
    for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) { s += L(px(x, y)); n++; }
    row.push(Math.round(s / n));
  }
  console.log(String(gy).padStart(3) + '   ' + row.map(v => String(v).padStart(5)).join(''));
}

// 检查"最外圈"（0~8px / 宽-8~宽）的亮度 —— 真正的遮罩应该贴边
console.log('\n=== 贴边条带亮度（1280 空间的 0~6px 与边缘）===');
function strip(name, x0, y0, x1, y1) {
  const X0 = Math.round(x0 * S), X1 = Math.round(x1 * S), Y0 = Math.round(y0 * S), Y1 = Math.round(y1 * S);
  let s = 0, n = 0;
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) { s += L(px(x, y)); n++; }
  console.log(`  ${name}  [${x0},${y0},${x1},${y1}]  → ${Math.round(s / n)}`);
}
strip('最左竖条 ', 0, 100, 6, 620);
strip('最右竖条 ', 1274, 100, 1280, 620);
strip('最顶横条 ', 200, 0, 1080, 6);
strip('最底横条 ', 200, 714, 1080, 720);
