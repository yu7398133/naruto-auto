// 扫描一批战斗帧，找出「第 X 回」回合指示器的不同数字版本。
// 判据：顶部中央区域 [580,10,715,80]（1280）内，模板匹配 SAD 低者。
// 用法：node tools/scan-round-frames.cjs <dir> [模板png]
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

const dir = process.argv[2];
const tmplPath = process.argv[3] || 'tools/round-badge-tmpl.png';
const tmplDec = decodePNG(fs.readFileSync(tmplPath));
const tw = tmplDec.W, th = tmplDec.H;
const tg = new Uint8Array(tw * th);
for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) { const i = y * tmplDec.stride + x * tmplDec.bpp; tg[y * tw + x] = (tmplDec.img[i] * 77 + tmplDec.img[i + 1] * 151 + tmplDec.img[i + 2] * 28) >> 8; }

const files = fs.readdirSync(dir).filter(f => /\.(png|jpg|jpeg)$/i.test(f)).sort();
console.log(`目录 ${dir}：${files.length} 个文件   模板 ${tw}x${th}\n`);

const R = [580, 10, 715, 80];
const rw = R[2] - R[0], rh = R[3] - R[1];
const results = [];

for (const f of files) {
  const p = path.join(dir, f);
  let dec;
  try { dec = decodePNG(fs.readFileSync(p)); } catch (e) { continue; }   // 跳过非 PNG
  const LW = 1280, LH = 720; const fg = new Uint8Array(LW * LH);
  for (let y = 0; y < LH; y++) { const sy = Math.min(dec.H - 1, Math.round(y * dec.H / LH));
    for (let x = 0; x < LW; x++) { const sx = Math.min(dec.W - 1, Math.round(x * dec.W / LW));
      const i = sy * dec.stride + sx * dec.bpp;
      fg[y * LW + x] = (dec.img[i] * 77 + dec.img[i + 1] * 151 + dec.img[i + 2] * 28) >> 8; } }
  let best = 1e9, bx = -1, by = -1;
  for (let ry = 0; ry + th <= rh; ry += 1) {
    for (let rx = 0; rx + tw <= rw; rx += 1) {
      let sad = 0, n = 0;
      for (let ty = 0; ty < th; ty += 2) {
        const frow = (R[1] + ry + ty) * LW + (R[0] + rx), trow = ty * tw;
        for (let tx = 0; tx < tw; tx += 2) { sad += Math.abs(fg[frow + tx] - tg[trow + tx]); n++; }
      }
      const v = sad / n;
      if (v < best) { best = v; bx = R[0] + rx; by = R[1] + ry; }
    }
  }
  results.push({ f, sad: best, x: bx, y: by });
}

results.sort((a, b) => a.sad - b.sad);
console.log('=== SAD 最低的前 20 个（<25 视为命中）===');
for (const r of results.slice(0, 20)) console.log(`  ${r.sad.toFixed(1).padStart(6)}  @(${r.x},${r.y})  ${r.f}`);
const hits = results.filter(r => r.sad <= 25);
console.log(`\n命中(<25): ${hits.length} / ${results.length}`);
if (hits.length > 20) console.log('（只列了前 20 个）');
