// 回验：新模板 vs 旧模板，在同一张招募页截图上的 SAD 对比。
// 阈值 25（脚本 findTemplate 默认）。理想：新模板 SAD 应远小于 25。
// 用法：node tools/verify-recruit-tmpl.cjs <shot.png>
const fs = require('fs');
const path = require('path');
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
const mk = (d) => ({ W: d.W, H: d.H, px: (x, y) => { const i = y * d.stride + x * d.bpp; return [d.img[i], d.img[i + 1], d.img[i + 2]]; } });

// 1920 → 1280 缩放
function toLogical(dec) {
  const LW = 1280, LH = 720; const out = Buffer.alloc(LW * LH * 3);
  for (let y = 0; y < LH; y++) { const sy = Math.min(dec.H - 1, Math.round(y * dec.H / LH));
    for (let x = 0; x < LW; x++) { const sx = Math.min(dec.W - 1, Math.round(x * dec.W / LW));
      const si = sy * dec.stride + sx * dec.bpp, di = (y * LW + x) * 3;
      out[di] = dec.img[si]; out[di + 1] = dec.img[si + 1]; out[di + 2] = dec.img[si + 2]; } }
  return { W: LW, H: LH, px: (x, y) => { const i = (y * LW + x) * 3; return [out[i], out[i + 1], out[i + 2]]; } };
}

const shot = toLogical(decodePNG(fs.readFileSync(process.argv[2])));
const usSrc = fs.readFileSync(path.join(__dirname, '..', 'naruto-auto.user.js'), 'utf8');

// 旧模板
const oldB64 = usSrc.match(/const RECRUIT_TAB_TMPL_SRC = 'data:image\/png;base64,' \+ '([A-Za-z0-9+/=]+)'/)[1];
const oldT = mk(decodePNG(Buffer.from(oldB64, 'base64')));
// 新模板
const newT = mk(decodePNG(fs.readFileSync(path.join(__dirname, 'recruit-tmpl-new.png'))));

const L = (c) => (c[0] * 77 + c[1] * 151 + c[2] * 28) >> 8;
function scan(tm, label) {
  let best = { s: 1e9, x: 0, y: 0 };
  for (let oy = 90; oy < 700 - tm.H; oy += 1) {
    for (let ox = 8; ox <= 159 - tm.W; ox += 1) {
      let s = 0, n = 0;
      for (let y = 0; y < tm.H; y += 1) for (let x = 0; x < tm.W; x += 1) { s += Math.abs(L(tm.px(x, y)) - L(shot.px(ox + x, oy + y))); n++; }
      const v = s / n;
      if (v < best.s) best = { s: v, x: ox, y: oy };
    }
  }
  console.log(`${label} (${tm.W}x${tm.H}): 最优 SAD=${best.s.toFixed(1)} @ (${best.x},${best.y})  ` +
    `${best.s <= 25 ? '✅ 命中（<阈值25）' : '❌ 不命中'}`);
  return best;
}
console.log('阈值 25（findTemplate 默认）\n');
const o = scan(oldT, '旧模板');
const nw = scan(newT, '新模板');
console.log(`\n新模板中心(1280空间): (${nw.x + Math.round(newT.W / 2)}, ${nw.y + Math.round(newT.H / 2)})`);
console.log(`  期望 ≈ (88, 667)  ← 由 1920 的 (132,1001) ÷1.5 得来`);
