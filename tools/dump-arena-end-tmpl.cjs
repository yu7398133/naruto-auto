// 导出角斗场「结算图标」模板，报尺寸/亮度，便于判断模板是否已过期。
// 用法：node tools/dump-arena-end-tmpl.cjs
const fs = require('fs');
const zlib = require('zlib');

const src = fs.readFileSync('naruto-auto.user.js', 'utf8');
const m = src.match(/const ARENA_END_ICON_TMPL = 'data:image\/png;base64,([A-Za-z0-9+/=]+)'/);
if (!m) { console.error('未找到 ARENA_END_ICON_TMPL'); process.exit(1); }
const buf = Buffer.from(m[1], 'base64');
fs.writeFileSync('tools/arena-end-tmpl.png', buf);

function decodePNG(b) {
  let off = 8, W = 0, H = 0, bd = 0, ct = 0, il = 0; const idat = [];
  while (off < b.length) {
    const len = b.readUInt32BE(off), t = b.toString('ascii', off + 4, off + 8);
    const d = b.subarray(off + 8, off + 8 + len);
    if (t === 'IHDR') { W = d.readUInt32BE(0); H = d.readUInt32BE(4); bd = d[8]; ct = d[9]; il = d[12]; }
    else if (t === 'IDAT') idat.push(d);
    else if (t === 'IEND') break;
    off += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = W * bpp, img = Buffer.alloc(H * stride);
  let p = 0;
  for (let y = 0; y < H; y++) {
    const ft = raw[p++], line = raw.subarray(p, p + stride); p += stride;
    const prev = y > 0 ? img.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = img.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, bb = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (ft === 1) v += a; else if (ft === 2) v += bb; else if (ft === 3) v += (a + bb) >> 1;
      else if (ft === 4) { const pa = Math.abs(bb - c), pb = Math.abs(a - c), pc = Math.abs(a + bb - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? bb : c); }
      cur[x] = v & 255;
    }
  }
  return { W, H, bpp, stride, img };
}

const d = decodePNG(buf);
const L = (x, y) => { const i = y * d.stride + x * d.bpp; return (d.img[i] * 77 + d.img[i + 1] * 151 + d.img[i + 2] * 28) >> 8; };
let mn = 255, mx = 0, s = 0, n = 0;
for (let y = 0; y < d.H; y++) for (let x = 0; x < d.W; x++) { const l = L(x, y); mn = Math.min(mn, l); mx = Math.max(mx, l); s += l; n++; }
console.log(`模板已导出 tools/arena-end-tmpl.png`);
console.log(`尺寸: ${d.W}x${d.H}`);
console.log(`亮度: min=${mn} max=${mx} 平均=${Math.round(s / n)}`);
console.log(`搜索区: [1095, 2, 1168, 62]  (1280 空间的右上角)`);
console.log(`搜索区尺寸: ${1168 - 1095} x ${62 - 2}`);
