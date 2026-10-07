// 从实机战斗截图抠出「第 X 回」回合指示器模板（用于「是否在战斗中」判定）。
// 用法：node tools/build-round-badge-tmpl.cjs <shot.png>
// 输出：tools/round-badge-tmpl.png + base64 文本
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
  for (let y = 0; y < H; y++) {
    raw[o++] = 0;
    for (let x = 0; x < W; x++) { const c = get(x, y); raw[o++] = c[0]; raw[o++] = c[1]; raw[o++] = c[2]; }
  }
  const tb = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; tb[n] = c >>> 0; }
  const crc = (buf) => { let c = 0xFFFFFFFF; for (const b of buf) c = tb[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.from(type, 'ascii');
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const dec = decodePNG(fs.readFileSync(process.argv[2]));
const src = (x, y) => { const i = y * dec.stride + x * dec.bpp; return [dec.img[i], dec.img[i + 1], dec.img[i + 2]]; };
console.log(`原图 ${dec.W}x${dec.H}`);

// 「第 3 回」实测 1920 空间 x∈[900,1042] y∈[28,96]，四周留 4px 余量
const BOX = { x1: 896, y1: 24, x2: 1046, y2: 100 };
const TW192 = BOX.x2 - BOX.x1, TH192 = BOX.y2 - BOX.y1;
// 缩放到 1280 空间
const TW = Math.round(TW192 / 1.5), TH = Math.round(TH192 / 1.5);
console.log(`抠取(1920) ${TW192}x${TH192} @ (${BOX.x1},${BOX.y1})  →  1280 空间 ${TW}x${TH}`);

const out = encodePNG(TW, TH, (x, y) => {
  const sx = Math.min(dec.W - 1, Math.round(BOX.x1 + x * 1.5));
  const sy = Math.min(dec.H - 1, Math.round(BOX.y1 + y * 1.5));
  return src(sx, sy);
});
fs.writeFileSync(path.join(__dirname, 'round-badge-tmpl.png'), out);
const b64 = out.toString('base64');
fs.writeFileSync(path.join(__dirname, 'round-badge-tmpl.b64.txt'), b64);
console.log(`已导出 tools/round-badge-tmpl.png (${out.length} 字节)`);
console.log(`base64 长度 ${b64.length}`);
console.log(`\n搜索区（1280）建议: [590, 14, 705, 70]  (留出拖动余量)`);
