// 结论验证：左按钮内部文字色 A=亮黄(免费一次) vs B=暗/深色(招财)
// 同时给出「文字区」矩形与两态的颜色统计，供探针标定。
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

// 两种判据各统计一遍：
//  P1「亮黄文字占比」: R>230 && G>230 && B<180   （A 的文字色 247,255,117）
//  P2「深色像素占比」: R<80 && G<80 && B<80      （B 的文字色 29,13,0）
function stat(img, area) {
  const [x0, y0, x1, y1] = area;
  let n = 0, p1 = 0, p2 = 0, gold = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const [r, g, b] = P(img, x, y); n++;
    if (r > 230 && g > 230 && b < 180) p1++;
    if (r < 80 && g < 80 && b < 80) p2++;
    if (r > 200 && g > 140 && b < 120) gold++;
  }
  return { n, brightYellowPct: +(100 * p1 / n).toFixed(1), darkPct: +(100 * p2 / n).toFixed(1), goldPct: +(100 * gold / n).toFixed(1) };
}

// 左按钮文字区候选：x 1160..1262，y 828..870
const TEXT = [1160, 828, 1262, 870];
console.log('=== 左按钮文字区 [' + TEXT + '] ===');
console.log(' A 免费一次:', JSON.stringify(stat(A, TEXT)));
console.log(' B 招财    :', JSON.stringify(stat(B, TEXT)));

// 收紧一点：只取文字主体
const TEXT2 = [1166, 834, 1256, 864];
console.log('=== 收紧 [' + TEXT2 + '] ===');
console.log(' A 免费一次:', JSON.stringify(stat(A, TEXT2)));
console.log(' B 招财    :', JSON.stringify(stat(B, TEXT2)));

// 逐行确认文字带上下边界
console.log('\n=== 逐行 亮黄文字占比 / 深色占比 (x∈[1160,1262]) ===');
for (let y = 820; y < 880; y += 2) {
  const a = stat(A, [1160, y, 1262, y + 2]);
  const b = stat(B, [1160, y, 1262, y + 2]);
  console.log(`  y=${y}  A亮黄=${String(a.brightYellowPct).padStart(5)}% A暗=${String(a.darkPct).padStart(5)}%  |  B亮黄=${String(b.brightYellowPct).padStart(5)}% B暗=${String(b.darkPct).padStart(5)}%`);
}

// 右按钮（招完本轮的消耗数）也顺带看一眼，确认它不干扰
console.log('\n=== 右按钮区 [1339,828,1400,870] ===');
console.log(' A:', JSON.stringify(stat(A, [1339, 828, 1400, 870])));
console.log(' B:', JSON.stringify(stat(B, [1339, 828, 1400, 870])));
