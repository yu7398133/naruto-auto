// 在 1280 空间、按脚本真实搜索窗，对 shop2（真·商城截图）复现脚本的匹配过程。
// shop2 需要先缩到 1280x720（模拟脚本 vision canvas）。
const fs = require('fs'); const zlib = require('zlib'); const path = require('path');
function readPNG(p) {
  const b = fs.readFileSync(p); let off = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (off < b.length) { const len = b.readUInt32BE(off), type = b.toString('ascii', off + 4, off + 8); const data = b.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; } else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break; off += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat)); const ch = ct === 6 ? 4 : ct === 2 ? 3 : 4, stride = w * ch;
  const out = Buffer.alloc(w * h * ch); let prev = Buffer.alloc(stride), pos = 0;
  for (let y = 0; y < h; y++) { const ft = raw[pos++]; const line = Buffer.from(raw.slice(pos, pos + stride)); pos += stride;
    for (let i = 0; i < stride; i++) { const a = i >= ch ? line[i - ch] : 0, bb = prev[i], c = i >= ch ? prev[i - ch] : 0; let v = line[i];
      if (ft === 1) v += a; else if (ft === 2) v += bb; else if (ft === 3) v += (a + bb) >> 1;
      else if (ft === 4) { const pp = a + bb - c, pa = Math.abs(pp - a), pb = Math.abs(pp - bb), pc = Math.abs(pp - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? bb : c); } line[i] = v & 255; }
    line.copy(out, y * stride); prev = line; }
  return { w, h, ch, data: out };
}
function resize(img, tw, th) {
  const out = Buffer.alloc(tw * th * 4);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const sx = x * img.w / tw, sy = y * img.h / th;
    const x0 = Math.floor(sx), y0 = Math.floor(sy);
    const x1 = Math.min(x0 + 1, img.w - 1), y1 = Math.min(y0 + 1, img.h - 1);
    const fx = sx - x0, fy = sy - y0;
    for (let c = 0; c < 3; c++) {
      const p00 = img.data[(y0 * img.w + x0) * img.ch + c], p10 = img.data[(y0 * img.w + x1) * img.ch + c];
      const p01 = img.data[(y1 * img.w + x0) * img.ch + c], p11 = img.data[(y1 * img.w + x1) * img.ch + c];
      out[(y * tw + x) * 4 + c] = Math.round((p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy);
    }
    out[(y * tw + x) * 4 + 3] = 255;
  }
  return { w: tw, h: th, ch: 4, data: out };
}
function sadAt(frame, tmpl, fx, fy) {
  let s = 0, n = 0;
  for (let y = 0; y < tmpl.h; y++) for (let x = 0; x < tmpl.w; x++) {
    const fi = ((fy + y) * frame.w + (fx + x)) * frame.ch, ti = (y * tmpl.w + x) * tmpl.ch;
    s += Math.abs(frame.data[fi] - tmpl.data[ti]) + Math.abs(frame.data[fi + 1] - tmpl.data[ti + 1]) + Math.abs(frame.data[fi + 2] - tmpl.data[ti + 2]);
    n += 3;
  }
  return s / n;
}

const SEARCH = [8, 90, 159, 700];   // MENU_TMPL_SEARCH_X1/X2（1280 空间）

for (const [name, src] of [['shop1', 'shop1.png'], ['shop2', 'shop2.png']]) {
  const full = readPNG(path.join(__dirname, 'crop', src));
  const f1280 = resize(full, 1280, 720);
  const rawT = readPNG(path.join(__dirname, 'crop', name === 'shop1' ? 'F_shop.png' : 'F_shop.png'));
  // 模板必须同比缩到 1280 空间
  const t1280 = resize(rawT, Math.round(rawT.w * 1280 / full.w), Math.round(rawT.h * 720 / full.h));
  let best = { d: 1e9, x: -1, y: -1 };
  for (let y = SEARCH[1]; y <= Math.min(SEARCH[3], f1280.h - t1280.h - 1); y++)
    for (let x = SEARCH[0]; x <= Math.min(SEARCH[2], f1280.w - t1280.w - 1); x++) {
      const d = sadAt(f1280, t1280, x, y);
      if (d < best.d) best = { d, x, y };
    }
  console.log(`${name}: 模板缩到1280 = ${t1280.w}x${t1280.h}  搜索窗 x${SEARCH[0]}..${SEARCH[2]} y${SEARCH[1]}..${SEARCH[3]}`);
  console.log(`   最小SAD=${best.d.toFixed(2)} @ (${best.x},${best.y})  ${best.d <= 25 ? '✓ 会命中' : '✗ 阈值25下未命中'}`);
}
