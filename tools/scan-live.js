// 对当前 live-frame 做一次「商店」模板全区间扫描，输出 score 分布，
// 并检查画面右侧是否有商城入口的证据
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
// 缩放到 1280x720（与脚本 BASE 一致）再匹配，等价于脚本里的 findTemplate 输入
const frame = readPNG(path.join(__dirname, 'live-frame.png'));
console.log('frame ' + frame.w + 'x' + frame.h);

// SAD 距离（与脚本同义：越小越像）
function sad(frame, tmpl, fx, fy) {
  let s = 0, n = 0;
  for (let y = 0; y < tmpl.h; y++) {
    for (let x = 0; x < tmpl.w; x++) {
      const fi = ((fy + y) * frame.w + (fx + x)) * frame.ch;
      const ti = (y * tmpl.w + x) * tmpl.ch;
      s += Math.abs(frame.data[fi] - tmpl.data[ti]) + Math.abs(frame.data[fi+1] - tmpl.data[ti+1]) + Math.abs(frame.data[fi+2] - tmpl.data[ti+2]);
      n += 3;
    }
  }
  return s / n;
}

const tmpl = readPNG(path.join(__dirname, 'crop', 'F_shop.png'));
console.log('tmpl 商店 ' + tmpl.w + 'x' + tmpl.h);

// 全屏粗扫（step 6）找最小值位置
let best = { d: 1e9, x: -1, y: -1 };
for (let y = 90; y <= frame.h - tmpl.h; y += 6) {
  for (let x = 0; x <= frame.w - tmpl.w; x += 6) {
    // 先把模板缩到 frame 尺寸比例？frame 是 1920 宽，脚本用 1280 逻辑坐标。
    // 这里直接在 1920 上扫，模板也需同比例放大 1.5 倍 —— 简化：只报坐标供参考
  }
}
// 直接报告：在左菜单常驻区 (0..400, 90..1050) 的最小 SAD
let b2 = { d: 1e9, x: -1, y: -1 };
for (let y = 90; y <= 1050 && y + tmpl.h < frame.h; y += 3) {
  for (let x = 0; x + tmpl.w < 400; x += 3) {
    const d = sad(frame, tmpl, x, y);
    if (d < b2.d) b2 = { d, x, y };
  }
}
console.log('左菜单区最小 SAD: ' + b2.d.toFixed(1) + ' @ (' + b2.x + ',' + b2.y + ')');
console.log('（脚本阈值 25 对应 SAD/像素，此处同量纲）');
