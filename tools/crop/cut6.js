const fs = require('fs'); const zlib = require('zlib');
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
let T = null;
function crc32(buf) { if (!T) { T = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; } } let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = T[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function writePNG(path, w, h, rgba) { const stride = w * 4; const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(path, Buffer.concat([Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])); }
function crop(img, x0, y0, x1, y1, out) { const w = x1 - x0 + 1, h = y1 - y0 + 1; const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const si = ((y0 + y) * img.w + (x0 + x)) * img.ch, di = (y * w + x) * 4;
    buf[di] = img.data[si]; buf[di + 1] = img.data[si + 1]; buf[di + 2] = img.data[si + 2]; buf[di + 3] = 255; }
  writePNG(out, w, h, buf); return { w, h, x0, y0, x1, y1 }; }

const s2 = readPNG(__dirname + '/shop2.png');
// 逐行统计「白字像素数」，找出「特权商店」那一行的精确 y 区间
function brightCount(y, x0, x1) { let n = 0;
  for (let x = x0; x <= x1; x++) { const i = (y * s2.w + x) * s2.ch;
    const g = (s2.data[i]*299 + s2.data[i+1]*587 + s2.data[i+2]*114)/1000;
    const s = Math.max(s2.data[i],s2.data[i+1],s2.data[i+2]) - Math.min(s2.data[i],s2.data[i+1],s2.data[i+2]);
    if (g > 195 && s < 55) n++; } return n; }
console.log('--- 逐行白字数 y=530..650 (x 45..250) ---');
for (let y = 530; y <= 650; y += 2) { const n = brightCount(y, 45, 250);
  if (n > 0) console.log('  y=' + y + '  n=' + n); }
