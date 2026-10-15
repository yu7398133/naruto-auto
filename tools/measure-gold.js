// 只做测量：从两张真机截图里定位「免费一次 / 招财」按钮的文字区域与颜色特征。
// 依据：样本 A=初始态(免费一次)，样本 B=已招一次后(招财)。
// 目的：为 goldFreeText / goldDone 两个探针找出**有区分度**的区域，而不是沿用旧标定。
const fs = require('fs');
const path = require('path');

// 极简 PNG 解码：只支持 8bit RGB/RGBA 非隔行（浏览器截图就是这种）
function decodePNG(buf) {
  let p = 8; const chunks = {};
  let w = 0, h = 0, bd = 0, ct = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bd = data[8]; ct = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bd !== 8) throw new Error('只支持 8bit, got ' + bd);
  const zlib = require('zlib');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : 0;
  if (!ch) throw new Error('不支持的 colorType ' + ct);
  const stride = w * ch;
  const out = Buffer.alloc(w * h * 3);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (ft === 1) v += a; else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      out[(y * w + x) * 3] = cur[x * ch];
      out[(y * w + x) * 3 + 1] = cur[x * ch + 1];
      out[(y * w + x) * 3 + 2] = cur[x * ch + 2];
    }
    prev = cur;
  }
  return { w, h, data: out };
}

function px(img, x, y) {
  const i = (y * img.w + x) * 3;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}
// 区域统计：均值 / 标准差 / 与该色的近距离占比
function stat(img, area, color, tol) {
  const [x0, y0, x1, y1] = area;
  let n = 0, sr = 0, sg = 0, sb = 0, sr2 = 0, sg2 = 0, sb2 = 0, hit = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const [r, g, b] = px(img, x, y);
    n++; sr += r; sg += g; sb += b; sr2 += r * r; sg2 += g * g; sb2 += b * b;
    if (Math.abs(r - color[0]) < tol && Math.abs(g - color[1]) < tol && Math.abs(b - color[2]) < tol) hit++;
  }
  const mr = sr / n, mg = sg / n, mb = sb / n;
  const sd = Math.sqrt(Math.max(0, sr2 / n - mr * mr) + Math.max(0, sg2 / n - mg * mg) + Math.max(0, sb2 / n - mb * mb));
  return { n, r: +mr.toFixed(1), g: +mg.toFixed(1), b: +mb.toFixed(1), std: +sd.toFixed(1), hitPct: +(100 * hit / n).toFixed(1) };
}

const dir = path.join(__dirname, 'zc');
const A = decodePNG(fs.readFileSync(path.join(dir, 'free.png')));     // 免费一次（初始态）
const B = decodePNG(fs.readFileSync(path.join(dir, 'zhaocai.png')));  // 招财（已招 1 次）
console.log('A(免费一次)', A.w + 'x' + A.h, ' B(招财)', B.w + 'x' + B.h);

// 老探针标定区（源码 2227/2231 附近）：[804,544,864,584]
const OLD = [804, 544, 864, 584];
console.log('\n=== 老标定区 [' + OLD + '] ===');
console.log(' 免费一次态:', JSON.stringify(stat(A, OLD, [198, 153, 30], 18)));
console.log(' 招财态    :', JSON.stringify(stat(B, OLD, [198, 153, 30], 18)));
console.log(' 免费一次态(done色):', JSON.stringify(stat(A, OLD, [217, 167, 22], 20)));
console.log(' 招财态(done色)    :', JSON.stringify(stat(B, OLD, [217, 167, 22], 20)));

// 扫按钮横向条带，找差异最大的列
const Y0 = 530, Y1 = 600;
console.log('\n=== 逐列差异扫描 y∈[' + Y0 + ',' + Y1 + ') ===');
let rows = [];
for (let x = 680; x < 1120; x += 4) {
  const sa = stat(A, [x, Y0, x + 4, Y1], [0, 0, 0], 1);
  const sb = stat(B, [x, Y0, x + 4, Y1], [0, 0, 0], 1);
  const d = Math.abs(sa.r - sb.r) + Math.abs(sa.g - sb.g) + Math.abs(sa.b - sb.b);
  rows.push({ x, d: +d.toFixed(0), aR: sa.r, bR: sb.r });
}
rows.sort((p, q) => q.d - p.d);
console.log('差异最大的 12 列:');
rows.slice(0, 12).forEach(r => console.log(`  x=${r.x} 差异=${r.d}  A均R=${r.aR}  B均R=${r.bR}`));
console.log('差异最小的 6 列（可作稳定背景）:');
rows.slice(-6).forEach(r => console.log(`  x=${r.x} 差异=${r.d}`));

// 逐行差异（限定左按钮 x 范围）
console.log('\n=== 逐行差异扫描 x∈[780,900] ===');
let rws = [];
for (let y = 520; y < 610; y += 2) {
  const sa = stat(A, [780, y, 900, y + 2], [0, 0, 0], 1);
  const sb = stat(B, [780, y, 900, y + 2], [0, 0, 0], 1);
  const d = Math.abs(sa.r - sb.r) + Math.abs(sa.g - sb.g) + Math.abs(sa.b - sb.b);
  rws.push({ y, d: +d.toFixed(0) });
}
rws.sort((p, q) => q.d - p.d);
console.log('差异最大的 10 行:');
rws.slice(0, 10).forEach(r => console.log(`  y=${r.y} 差异=${r.d}`));
