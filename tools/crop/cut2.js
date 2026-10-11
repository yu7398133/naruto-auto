// 抠最终模板：商店 / 特权商店 / 特权积分
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
  let prev = Buffer.alloc(stride), pos = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[pos++];
    const line = Buffer.from(raw.slice(pos, pos + stride)); pos += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0, bb = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (ft === 1) v += a; else if (ft === 2) v += bb;
      else if (ft === 3) v += (a + bb) >> 1;
      else if (ft === 4) {
        const pp = a + bb - c, pa = Math.abs(pp - a), pb = Math.abs(pp - bb), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? bb : c);
      }
      line[i] = v & 255;
    }
    line.copy(out, y * stride); prev = line;
  }
  return { w, h, ch, data: out };
}

let T = null;
function crc32(buf) {
  if (!T) { T = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; } }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = T[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function writePNG(path, w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]));
}

// 找文字左右边界（在给定 y 带内，找暗像素的 x 范围）
function xBounds(img, y0, y1, x0, x1) {
  let minX = 1e9, maxX = -1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * img.w + x) * img.ch;
    const g = (img.data[i] * 299 + img.data[i + 1] * 587 + img.data[i + 2] * 114) / 1000;
    if (g < 110) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
  }
  return [minX, maxX];
}

function crop(img, x0, y0, x1, y1, out) {
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = ((y0 + y) * img.w + (x0 + x)) * img.ch, di = (y * w + x) * 4;
    buf[di] = img.data[si]; buf[di + 1] = img.data[si + 1]; buf[di + 2] = img.data[si + 2]; buf[di + 3] = 255;
  }
  writePNG(out, w, h, buf);
  console.log(out + '  ' + w + 'x' + h + '  x=' + x0 + '..' + x1 + ' y=' + y0 + '..' + y1);
  return { w, h, x0, y0, x1, y1 };
}

const s1 = readPNG(__dirname + '/shop1.png');
const s2 = readPNG(__dirname + '/shop2.png');

console.log('--- 商店 (shop1 row2, y 585..626) ---');
const b1 = xBounds(s1, 585, 626, 40, 260);
console.log('  x bounds: ' + b1[0] + '..' + b1[1]);
crop(s1, b1[0] - 4, 585 - 4, b1[1] + 4, 626 + 4, __dirname + '/T_shop.png');
// 同一文字在 shop2 里是 row2 (y 422..474)
const b1b = xBounds(s2, 422, 474, 40, 260);
crop(s2, b1b[0] - 4, 422 - 4, b1b[1] + 4, 474 + 4, __dirname + '/T_shop_in_s2.png');

console.log('--- 特权积分 页签 (shop2 tabs) ---');
// tabs 图里「特权积分」是第 3 块，估计 x 约 400+490..400+690
const b2 = xBounds(s2, 130, 185, 470, 700);
console.log('  x bounds: ' + b2[0] + '..' + b2[1]);
crop(s2, b2[0] - 4, 130, b2[1] + 4, 185, __dirname + '/T_jifen.png');

// 找「特权商店」行：shop2 左侧菜单在 y 335..377 是「推荐」？先全扫一遍 y 240..900 的左侧文字
console.log('--- shop2 左侧菜单文字行 (x 40..260) ---');
for (let y = 240; y < 900; y += 1) {
  // 略
}
const rows2 = [[247, 289], [299, 320], [335, 377], [422, 474], [500, 552], [560, 612], [620, 672], [680, 732], [740, 792], [800, 852]];
rows2.forEach((r, i) => {
  const bb = xBounds(s2, r[0], r[1], 40, 270);
  if (bb[1] < 0) { console.log('  row' + i + ' y=' + r[0] + '..' + r[1] + '  空'); return; }
  console.log('  row' + i + ' y=' + r[0] + '..' + r[1] + '  x=' + bb[0] + '..' + bb[1] + '  w=' + (bb[1] - bb[0] + 1));
});
