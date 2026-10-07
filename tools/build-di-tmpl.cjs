// 从「第 3 回」里只切「第」字（避开数字）做模板，并回验。
// 用法：node tools/build-di-tmpl.cjs <shot.png> [x0 x1]
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function decodePNG(buf) {
  let off = 8, W = 0, H = 0, bd = 0, ct = 0, il = 0; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), t = buf.toString('ascii', off + 4, off + 8);
    const d = buf.subarray(off + 8, off + 8 + len);
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
function encodePNG(W, H, get) {
  const raw = Buffer.alloc(H * (W * 3 + 1));
  let o = 0;
  for (let y = 0; y < H; y++) { raw[o++] = 0; for (let x = 0; x < W; x++) { const c = get(x, y); raw[o++] = c[0]; raw[o++] = c[1]; raw[o++] = c[2]; } }
  const tb = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; tb[n] = c >>> 0; }
  const crc = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = tb[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const tt = Buffer.from(t, 'ascii'); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(Buffer.concat([tt, d]))); return Buffer.concat([l, tt, d, cc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const shotPath = process.argv[2];
const dec = decodePNG(fs.readFileSync(shotPath));
const src = (x, y) => { const i = y * dec.stride + x * dec.bpp; return [dec.img[i], dec.img[i + 1], dec.img[i + 2]]; };

// 「第」只切左段（1920 空间）；y 用实测 [28,96] 上下留 3px
const X0 = +(process.argv[3] || 886);
const X1 = +(process.argv[4] || 946);
const Y0 = 25, Y1 = 99;
const TW = Math.round((X1 - X0) / 1.5), TH = Math.round((Y1 - Y0) / 1.5);
console.log(`只切「第」: 1920 x∈[${X0},${X1}] y∈[${Y0},${Y1}]  → 1280 ${TW}x${TH}`);

const out = encodePNG(TW, TH, (x, y) => {
  const sx = Math.min(dec.W - 1, Math.round(X0 + x * 1.5));
  const sy = Math.min(dec.H - 1, Math.round(Y0 + y * 1.5));
  return src(sx, sy);
});
fs.writeFileSync(path.join(__dirname, 'di-tmpl.png'), out);
console.log(`已导出 tools/di-tmpl.png (${out.length}B, base64 ${out.toString('base64').length})`);

// 回验：在整幅 1280 图上扫（step:1）
const LW = 1280, LH = 720; const fg = new Uint8Array(LW * LH);
for (let y = 0; y < LH; y++) { const sy = Math.min(dec.H - 1, Math.round(y * dec.H / LH));
  for (let x = 0; x < LW; x++) { const sx = Math.min(dec.W - 1, Math.round(x * dec.W / LW));
    const i = sy * dec.stride + sx * dec.bpp;
    fg[y * LW + x] = (dec.img[i] * 77 + dec.img[i + 1] * 151 + dec.img[i + 2] * 28) >> 8; } }
const tg = new Uint8Array(TW * TH);
for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) { const i = y * out.length && 0; }
// 直接从 out 解回灰度
const td = decodePNG(out);
for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) { const i = y * td.stride + x * td.bpp; tg[y * TW + x] = (td.img[i] * 77 + td.img[i + 1] * 151 + td.img[i + 2] * 28) >> 8; }

const R = [580, 8, 720, 85];
const rw = R[2] - R[0], rh = R[3] - R[1];
let best = { s: 1e9, x: -1, y: -1 }, second = { s: 1e9, x: -1, y: -1 };
for (let ry = 0; ry + TH <= rh; ry++) {
  for (let rx = 0; rx + TW <= rw; rx++) {
    let sad = 0, n = 0;
    for (let ty = 0; ty < TH; ty++) { const fr = (R[1] + ry + ty) * LW + (R[0] + rx), tr = ty * TW;
      for (let tx = 0; tx < TW; tx++) { sad += Math.abs(fg[fr + tx] - tg[tr + tx]); n++; } }
    const v = sad / n;
    if (v < best.s) { second = best; best = { s: v, x: R[0] + rx, y: R[1] + ry }; }
    else if (v < second.s) second = { s: v, x: R[0] + rx, y: R[1] + ry };
  }
}
console.log(`\n=== 在 [${R}] 内回验 ===`);
console.log(`  最优 SAD = ${best.s.toFixed(1)} @ (${best.x},${best.y})`);
console.log(`  次优 SAD = ${second.s.toFixed(1)} @ (${second.x},${second.y})`);
console.log(`  （自比应≈0；"次优"反映背景是否有相似结构 —— 差得越远越安全）`);
