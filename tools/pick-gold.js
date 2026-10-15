// 直接用两组候选区域在真图上打分，用数据决定，不再做纸面换算。
// 目标：找到「免费一次(亮黄字) vs 招财(深色字)」区分度最大的脚本坐标区域。
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

function score(img, area) {
  const [x0, y0, x1, y1] = area;
  let n = 0, bright = 0, dark = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const [r, g, b] = P(img, x, y); n++;
    if (r > 230 && g > 230 && b < 180) bright++;
    if (r < 80 && g < 80 && b < 80) dark++;
  }
  return { bright: +(100 * bright / n).toFixed(1), dark: +(100 * dark / n).toFixed(1) };
}

// 候选（**样本坐标**，1920x1080）。脚本坐标 = 样本 / 1.5。
const cands = {
  '文字主体(实测最优)': [1168, 832, 1256, 862],
  '整按钮含框': [1112, 802, 1299, 887],
  '只有文字左半': [1160, 826, 1210, 864],
  '只有文字右半': [1210, 826, 1262, 864],
  '向上偏(含按钮上沿)': [1168, 810, 1256, 862],
  '向下偏(含按钮下沿)': [1168, 832, 1256, 880],
};
console.log('=== 候选区评分（样本坐标）===');
for (const [name, a] of Object.entries(cands)) {
  const sa = score(A, a), sb = score(B, a);
  const sepB = (sa.bright / Math.max(sb.bright, 0.01)).toFixed(1);
  const sepD = (sb.dark / Math.max(sa.dark, 0.01)).toFixed(1);
  console.log(` ${name.padEnd(22)} ${JSON.stringify(a)}`);
  console.log(`    免费一次: 亮黄=${sa.bright}% 暗=${sa.dark}%   |  招财: 亮黄=${sb.bright}% 暗=${sb.dark}%`);
  console.log(`    分离度: 亮黄 ${sepB}x , 暗 ${sepD}x`);
}
