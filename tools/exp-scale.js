// 决定性实验：把模板在「已知含有商店的原始截图」里自匹配，看 SAD 应该多小。
// 如果 shop1 里「商店」自匹配 SAD≈0-5，而 live-frame 里最小 56，
// 就说明 live-frame 根本没有「商店」，即问题不在匹配参数，而在「探测时机/画面不对」。
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
function sadAt(frame, tmpl, fx, fy) {
  let s = 0, n = 0;
  for (let y = 0; y < tmpl.h; y++) for (let x = 0; x < tmpl.w; x++) {
    const fi = ((fy + y) * frame.w + (fx + x)) * frame.ch, ti = (y * tmpl.w + x) * tmpl.ch;
    s += Math.abs(frame.data[fi] - tmpl.data[ti]) + Math.abs(frame.data[fi + 1] - tmpl.data[ti + 1]) + Math.abs(frame.data[fi + 2] - tmpl.data[ti + 2]);
    n += 3;
  }
  return s / n;
}
function bestIn(frame, tmpl, x0, y0, x1, y1, step) {
  let best = { d: 1e9, x: -1, y: -1 };
  for (let y = y0; y <= Math.min(y1, frame.h - tmpl.h - 1); y += step)
    for (let x = x0; x <= Math.min(x1, frame.w - tmpl.w - 1); x += step) {
      const d = sadAt(frame, tmpl, x, y);
      if (d < best.d) best = { d, x, y };
    }
  return best;
}

const tmplShop = readPNG(path.join(__dirname, 'crop', 'F_shop.png'));   // 来自 shop1, 82x48
const shop1 = readPNG(path.join(__dirname, 'crop', 'shop1.png'));       // 1920x1080 原图

console.log('--- A. 自匹配（同一张图画面上找自己）---');
// 模板抠自 x126..207 y582..629，中心应回到原处
const self = bestIn(shop1, tmplShop, 100, 560, 240, 650, 1);
console.log(`  shop1 内搜「商店」: 最小SAD=${self.d.toFixed(2)} @ (${self.x},${self.y})  期望 (126,582)`);

console.log('--- B. 跨图：live-frame（1920，主界面）---');
const live = readPNG(path.join(__dirname, 'live-frame.png'));
const lv = bestIn(live, tmplShop, 0, 0, live.w - tmplShop.w - 1, live.h - tmplShop.h - 1, 4);
console.log(`  live-frame 全屏搜「商店」: 最小SAD=${lv.d.toFixed(2)} @ (${lv.x},${lv.y})`);

console.log('--- C. 跨图：shop2（1920，商城-特权商店页）---');
const shop2 = readPNG(path.join(__dirname, 'crop', 'shop2.png'));
const s2 = bestIn(shop2, tmplShop, 0, 0, 400, shop2.h - tmplShop.h - 1, 2);
console.log(`  shop2 左列搜「商店」: 最小SAD=${s2.d.toFixed(2)} @ (${s2.x},${s2.y})`);
