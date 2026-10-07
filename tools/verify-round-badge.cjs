// 验证「第 X 回」模板：在同一张图上算 SAD，并检查"数字变化"的风险
// ——把模板里的数字部分遮掉再比，看能否只靠「第 回」二字稳定命中。
// 用法：node tools/verify-round-badge.cjs <shot.png>
const fs = require('fs');
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
const gray = (d) => { const g = new Uint8Array(d.W * d.H); for (let y = 0; y < d.H; y++) for (let x = 0; x < d.W; x++) { const i = y * d.stride + x * d.bpp; g[y * d.W + x] = (d.img[i] * 77 + d.img[i + 1] * 151 + d.img[i + 2] * 28) >> 8; } return g; };

const shotDec = decodePNG(fs.readFileSync(process.argv[2]));
// 截图 → 1280 灰度
const LW = 1280, LH = 720; const fg = new Uint8Array(LW * LH);
for (let y = 0; y < LH; y++) { const sy = Math.min(shotDec.H - 1, Math.round(y * shotDec.H / LH));
  for (let x = 0; x < LW; x++) { const sx = Math.min(shotDec.W - 1, Math.round(x * shotDec.W / LW));
    const i = sy * shotDec.stride + sx * shotDec.bpp;
    fg[y * LW + x] = (shotDec.img[i] * 77 + shotDec.img[i + 1] * 151 + shotDec.img[i + 2] * 28) >> 8; } }

const tmplDec = decodePNG(fs.readFileSync('tools/round-badge-tmpl.png'));
const tg = gray(tmplDec);
const tw = tmplDec.W, th = tmplDec.H;
console.log(`模板 ${tw}x${th}`);

// 在搜索区 [580,10,715,80] 内找最优（step:1）
function scan(maskDigits) {
  const R = [580, 10, 715, 80];
  const rw = R[2] - R[0], rh = R[3] - R[1];
  let best = { s: 1e9, x: -1, y: -1 };
  for (let ry = 0; ry + th <= rh; ry++) {
    for (let rx = 0; rx + tw <= rw; rx++) {
      let sad = 0, n = 0;
      for (let ty = 0; ty < th; ty += 2) {
        const frow = (R[1] + ry + ty) * LW + (R[0] + rx), trow = ty * tw;
        for (let tx = 0; tx < tw; tx += 2) {
          if (maskDigits && tx > tw * 0.45 && tx < tw * 0.62) continue;  // 遮掉中间数字列
          sad += Math.abs(fg[frow + tx] - tg[trow + tx]); n++;
        }
      }
      const v = sad / n;
      if (v < best.s) best = { s: v, x: R[0] + rx, y: R[1] + ry };
    }
  }
  return best;
}
const a = scan(false), b = scan(true);
console.log(`\n完整模板（含数字"3"）: SAD=${a.s.toFixed(1)} @ (${a.x},${a.y})`);
console.log(`遮掉数字列后          : SAD=${b.s.toFixed(1)} @ (${b.x},${b.y})`);
console.log(`\n（数字变化时只有「遮掉数字」的版本仍能命中）`);
