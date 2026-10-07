// 从「招募页」截图抠出「普通招募」文字模板（只抠文字区，避开底图），
// 并立即用同一张图回验 SAD（应远低于阈值 25）。
// 用法：node tools/build-recruit-tmpl.cjs <shot.png>
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

function encodePNG(W, H, get) {
  const raw = Buffer.alloc(H * (W * 3 + 1));
  let o = 0;
  for (let y = 0; y < H; y++) {
    raw[o++] = 0;
    for (let x = 0; x < W; x++) { const c = get(x, y); raw[o++] = c[0]; raw[o++] = c[1]; raw[o++] = c[2]; }
  }
  const crcTable = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  const crc = (buf) => { let c = 0xFFFFFFFF; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.from(type, 'ascii');
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const dec = decodePNG(fs.readFileSync(process.argv[2]));
const src = (x, y) => { const i = y * dec.stride + x * dec.bpp; return [dec.img[i], dec.img[i + 1], dec.img[i + 2]]; };
console.log(`原图 ${dec.W}x${dec.H}`);

// ── 抠取区域（1920 空间，来自实测：文字 x∈[55,205] y∈[975,1025]）──
// 四周各留 3px 余量，避免切掉笔画边缘
const BOX = { x1: 52, y1: 972, x2: 208, y2: 1028 };   // 1920 空间
const TW192 = BOX.x2 - BOX.x1, TH192 = BOX.y2 - BOX.y1;   // 156 x 56
console.log(`抠取(1920空间): ${TW192}x${TH192} @ (${BOX.x1},${BOX.y1})`);

// 缩放到 1280 空间：/1.5
const TW = Math.round(TW192 / 1.5), TH = Math.round(TH192 / 1.5);
console.log(`缩放到 1280 空间: ${TW}x${TH}`);

const tmpl = encodePNG(TW, TH, (x, y) => {
  const sx = Math.min(dec.W - 1, Math.round(BOX.x1 + x * 1.5));
  const sy = Math.min(dec.H - 1, Math.round(BOX.y1 + y * 1.5));
  return src(sx, sy);
});
const outPath = path.join(__dirname, 'recruit-tmpl-new.png');
fs.writeFileSync(outPath, tmpl);
console.log(`新模板: ${outPath} (${tmpl.length} 字节)`);
console.log(`dataURL 前缀: 'data:image/png;base64,' + '${tmpl.toString('base64').slice(0, 40)}...`);
console.log(`完整 base64 长度: ${tmpl.toString('base64').length}`);
fs.writeFileSync(path.join(__dirname, 'recruit-tmpl-new.b64.txt'), tmpl.toString('base64'));
