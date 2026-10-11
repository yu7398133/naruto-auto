// 量出左侧菜单栏各文字块的位置，用于抠模板
const fs = require('fs');
const zlib = require('zlib');

function readPNG(p) {
  const b = fs.readFileSync(p);
  let off = 8, w = 0, h = 0, bd = 0, ct = 0;
  const idat = [];
  while (off < b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString('ascii', off + 4, off + 8);
    const data = b.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bd = data[8]; ct = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : 4;
  const stride = w * ch;
  const out = Buffer.alloc(w * h * ch);
  let prev = Buffer.alloc(stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[pos++];
    const line = Buffer.from(raw.slice(pos, pos + stride));
    pos += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0;
      const bb = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (ft === 1) v += a;
      else if (ft === 2) v += bb;
      else if (ft === 3) v += (a + bb) >> 1;
      else if (ft === 4) {
        const pp = a + bb - c, pa = Math.abs(pp - a), pb = Math.abs(pp - bb), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? bb : c);
      }
      line[i] = v & 255;
    }
    line.copy(out, y * stride);
    prev = line;
  }
  return { w, h, ch, data: out };
}

// 在指定 x 范围内找「有内容的行带」（文字块），返回 y 区间列表
function rowBands(img, x0, x1, y0, y1, thresh) {
  const { w, ch, data } = img;
  const bands = [];
  let start = -1;
  for (let y = y0; y < y1; y++) {
    let n = 0;
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * ch;
      const g = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
      // 菜单文字是深色字在浅底上 → 找"暗像素"
      if (g < 120) n++;
    }
    if (n >= thresh) { if (start < 0) start = y; }
    else { if (start >= 0) { bands.push([start, y - 1]); start = -1; } }
  }
  if (start >= 0) bands.push([start, y1 - 1]);
  return bands;
}

for (const f of ['shop1.png', 'shop2.png']) {
  const img = readPNG(__dirname + '/' + f);
  console.log('\n=== ' + f + ' ' + img.w + 'x' + img.h + ' ch=' + img.ch + ' ===');
  const bands = rowBands(img, 60, 240, 100, 900, 8);
  for (const [a, b] of bands) {
    if (b - a < 6) continue;
    console.log('  y ' + a + '..' + b + '  (h=' + (b - a + 1) + ')  cy=' + Math.round((a + b) / 2));
  }
}
