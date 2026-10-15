// 在正确的行带(y≈842-857)上定位两个按钮的精确矩形，并分别标定「免费一次」/「招财」文字区。
// 样本 A=免费一次(初始态)  B=招财(已招1次)
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

// 1) 按钮行带里，逐列找「金色按钮」边界（金色 = 高R高G低B）
//    用 A 图（免费一次）定位左按钮，B 图定位左右两按钮。
function goldCols(img, y0, y1, x0, x1) {
  const out = [];
  for (let x = x0; x < x1; x++) {
    let n = 0, gold = 0;
    for (let y = y0; y < y1; y++) { const [r, g, b] = P(img, x, y); n++; if (r > 200 && g > 140 && b < 120) gold++; }
    out.push({ x, pct: gold / n });
  }
  return out;
}
function runs(cols, thr) {
  const rs = []; let s = null;
  for (const c of cols) {
    if (c.pct >= thr) { if (s === null) s = c.x; }
    else { if (s !== null) { rs.push([s, c.x - 1]); s = null; } }
  }
  if (s !== null) rs.push([s, cols[cols.length - 1].x]);
  return rs.filter(r => r[1] - r[0] > 20);
}
const YA = 820, YB = 880;
console.log('=== A(免费一次) 金色列连续段 (y∈[' + YA + ',' + YB + ')) ===');
console.log(JSON.stringify(runs(goldCols(A, YA, YB, 600, 1500), 0.5)));
console.log('=== B(招财) 金色列连续段 ===');
console.log(JSON.stringify(runs(goldCols(B, YA, YB, 600, 1500), 0.5)));

// 2) 逐行找按钮上下边界（在左按钮 x 带内）
function goldRows(img, x0, x1, y0, y1) {
  const out = [];
  for (let y = y0; y < y1; y++) {
    let n = 0, gold = 0;
    for (let x = x0; x < x1; x++) { const [r, g, b] = P(img, x, y); n++; if (r > 200 && g > 140 && b < 120) gold++; }
    out.push({ y, pct: gold / n });
  }
  return runs(out.map(o => ({ x: o.y, pct: o.pct })), 0.5);
}
console.log('\n=== A 左按钮纵向金色连续段 (x∈[790,880]) ===');
console.log(JSON.stringify(goldRows(A, 790, 880, 780, 920)));
console.log('=== B 左按钮纵向金色连续段 ===');
console.log(JSON.stringify(goldRows(B, 790, 880, 780, 920)));
