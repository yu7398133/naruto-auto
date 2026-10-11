// 预演 loader 的缩放逻辑 + 用缩放结果对 shop2 打分，确认会命中
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
function sadAt(f, t, fx, fy) { let s = 0, n = 0;
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const fi = ((fy + y) * f.w + (fx + x)) * f.ch, ti = (y * t.w + x) * t.ch;
    s += Math.abs(f.data[fi] - t.data[ti]) + Math.abs(f.data[fi+1] - t.data[ti+1]) + Math.abs(f.data[fi+2] - t.data[ti+2]); n += 3; }
  return s / n; }
function best(f, t, r) { let b = { d: 1e9, x: -1, y: -1 };
  for (let y = r[1]; y <= Math.min(r[3], f.h - t.h - 1); y++)
    for (let x = r[0]; x <= Math.min(r[2], f.w - t.w - 1); x++) { const d = sadAt(f, t, x, y); if (d < b.d) b = { d, x, y }; }
  return b; }

const BASE_W = 1280;
// 复刻脚本 loader：k = BASE_W / srcW
const SRC_W = 1920, k = BASE_W / SRC_W;
console.log('loader 缩放系数 k = 1280/1920 = ' + k.toFixed(4));
console.log('');

const shop2_1280 = resize(readPNG(path.join(__dirname,'crop','shop2.png')), 1280, 720);
const PRIV_MENU_SEARCH = [8, 90, 159, 700];
const PRIV_TAB_SEARCH  = [267, 67, 1000, 140];

for (const [file, name, win, thresh] of [
  ['F_shop.png',   '商店',     PRIV_MENU_SEARCH, 25],
  ['segB.png',     '特权商店', PRIV_TAB_SEARCH,  30],
  ['T2_jifen.png', '特权积分', PRIV_TAB_SEARCH,  30],
]) {
  const raw = readPNG(path.join(__dirname, 'crop', file));
  const tw = Math.round(raw.w * k), th = Math.round(raw.h * k);
  const scaled = resize(raw, tw, th);
  const r = best(shop2_1280, scaled, win);
  console.log(`${name.padEnd(6)} ${raw.w}x${raw.h} → ${tw}x${th}   score=${r.d.toFixed(1)} @(${r.x},${r.y})  阈值${thresh}  ${r.d <= thresh ? '✓ 命中' : '✗ 未命中'}`);
}
