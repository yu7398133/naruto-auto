// 抠出候选文字块 → PNG（用于人工/视觉确认哪个是「商店」「特权商店」「特权积分」）
const fs = require('fs');
const zlib = require('zlib');

function readPNG(p) {
  const b = fs.readFileSync(p);
  let off = 8, w = 0, h = 0, ct = 0;
  const idat = [];
  while (off < b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString('ascii', off + 4, off + 8);
    const data = b.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : 4;
  const stride = w * ch;
  const out = Buffer.alloc(w * h * ch);
  let prev = Buffer.alloc(stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[pos++];
    const line = Buffer.from(raw.slice(pos, pos + stride));
    pos += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0;
      const bb = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (ft === 1) v += a;
      else if (ft === 2) v += bb;
      else if (ft === 3) v += (a + bb) >> 1;
      else if (ft === 4) {
        const pp = a + bb - c, pa = Math.abs(pp - a), pb = Math.abs(pp - bb), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? bb : c);
      }
      line[i] = v & 255;
    }
    line.copy(out, y * stride);
    prev = line;
  }
  return { w, h, ch, data: out };
}

function writePNG(path, w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  let T = null;
  function crc32(buf) {
    if (!T) {
      T = [];
      for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
    }
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = T[(c ^ buf[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
  ]));
}

function crop(img, x0, y0, x1, y1) {
  const w = x1 - x0, h = y1 - y0;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = ((y0 + y) * img.w + (x0 + x)) * img.ch;
    const di = (y * w + x) * 4;
    out[di] = img.data[si]; out[di + 1] = img.data[si + 1];
    out[di + 2] = img.data[si + 2]; out[di + 3] = 255;
  }
  return { w, h, buf: out };
}

const X0 = 55, X1 = 250;
const s1 = readPNG(__dirname + '/shop1.png');
const s2 = readPNG(__dirname + '/shop2.png');

// shop1 的候选行带（左侧菜单）
const rows1 = [[246, 298], [498, 539], [585, 626], [673, 715], [761, 803], [824, 891]];
rows1.forEach((r, i) => {
  const c = crop(s1, X0, r[0] - 6, X1, r[1] + 6);
  writePNG(__dirname + '/s1_row' + i + '.png', c.w, c.h, c.buf);
  console.log('s1_row' + i + '.png  y=' + (r[0] - 6) + '..' + (r[1] + 6));
});

const rows2 = [[247, 289], [335, 377], [422, 474]];
rows2.forEach((r, i) => {
  const c = crop(s2, X0, r[0] - 6, X1, r[1] + 6);
  writePNG(__dirname + '/s2_row' + i + '.png', c.w, c.h, c.buf);
  console.log('s2_row' + i + '.png  y=' + (r[0] - 6) + '..' + (r[1] + 6));
});

// shop2 顶部页签带（特权忍者/特权道具/特权积分/特权月直购）
const c = crop(s2, 400, 120, 1400, 195);
writePNG(__dirname + '/s2_tabs.png', c.w, c.h, c.buf);
console.log('s2_tabs.png  x=400..1400 y=120..195');
