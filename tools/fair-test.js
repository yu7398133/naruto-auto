// 公平测试：每个模板对它【自己的来源截图】匹配（缩放后应命中）
// 模板从脚本 base64 解码（crop 目录已不全）
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
function resize(img, tw, th) {
  const out = Buffer.alloc(tw * th * 4);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const sx = x * img.w / tw, sy = y * img.h / th;
    const x0 = Math.floor(sx), y0 = Math.floor(sy);
    const x1 = Math.min(x0 + 1, img.w - 1), y1 = Math.min(y0 + 1, img.h - 1);
    const fx = sx - x0, fy = sy - y0;
    for (let c = 0; c < 3; c++) {
      const p00 = img.data[(y0*img.w+x0)*img.ch+c], p10 = img.data[(y0*img.w+x1)*img.ch+c];
      const p01 = img.data[(y1*img.w+x0)*img.ch+c], p11 = img.data[(y1*img.w+x1)*img.ch+c];
      out[(y*tw+x)*4+c] = Math.round((p00*(1-fx)+p10*fx)*(1-fy)+(p01*(1-fx)+p11*fx)*fy);
    }
    out[(y*tw+x)*4+3] = 255;
  }
  return { w: tw, h: th, ch: 4, data: out };
}
function sadAt(f, t, fx, fy) { let s = 0, n = 0;
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const fi = ((fy+y)*f.w+(fx+x))*f.ch, ti = (y*t.w+x)*t.ch;
    s += Math.abs(f.data[fi]-t.data[ti]) + Math.abs(f.data[fi+1]-t.data[ti+1]) + Math.abs(f.data[fi+2]-t.data[ti+2]); n += 3; }
  return s / n; }
function best(f, t, r) { let b = { d: 1e9, x: -1, y: -1 };
  for (let y = r[1]; y <= Math.min(r[3], f.h-t.h-1); y++)
    for (let x = r[0]; x <= Math.min(r[2], f.w-t.w-1); x++) { const d = sadAt(f,t,x,y); if (d < b.d) b = { d, x, y }; }
  return b; }

// 从脚本解码三个模板
const src = fs.readFileSync('C:/Users/chenyu/dsh/火影忍者/naruto-auto.user.js', 'utf8');
function decodeConst(name) {
  const re = new RegExp('const\\s+' + name + "\\s*=\\s*((?:'[^']*'|\\s*\\+\\s*)+);");
  const m = src.match(re); if (!m) return null;
  const parts = [...m[1].matchAll(/'([^']*)'/g)].map(x => x[1]);
  let j = parts.join('').replace(/^data:image\/[a-z]+;base64,/, '').replace(/[^A-Za-z0-9+/=]/g, '');
  const buf = Buffer.from(j, 'base64');
  // 写临时 png 再读
  const tmp = path.join(__dirname, '_tmp_' + name + '.png');
  fs.writeFileSync(tmp, buf);
  const img = readPNG(tmp); fs.unlinkSync(tmp);
  return img;
}

const K = 1280 / 1920;
const MENU = [8, 90, 159, 700];
const TAB  = [267, 67, 1000, 140];

const frames = { shop1: resize(readPNG(path.join(__dirname,'crop','shop1.png')),1280,720),
                 shop2: resize(readPNG(path.join(__dirname,'crop','shop2.png')),1280,720) };

for (const [cname, label, win, th] of [
  ['PRIV_SHOP_TMPL_SRC', '商店', MENU, 25],
  ['PRIV_TAB_TMPL_SRC',  '特权商店', MENU, 25],
  ['PRIV_JIFEN_TMPL_SRC','特权积分', TAB, 30],
]) {
  const raw = decodeConst(cname);
  if (!raw) { console.log(label + ': 解码失败'); continue; }
  const tw = Math.round(raw.w*K), thh = Math.round(raw.h*K);
  const sc = resize(raw, tw, thh);
  const line = [];
  for (const [fn, fr] of Object.entries(frames)) {
    const r = best(fr, sc, win);
    line.push(`${fn}=${r.d.toFixed(1)}${r.d<=th?'✓':'✗'}@(${r.x},${r.y})`);
  }
  console.log(`${label.padEnd(6)} ${raw.w}x${raw.h}→${tw}x${thh}  ` + line.join('  '));
}
