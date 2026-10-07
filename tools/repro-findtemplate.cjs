// 复现脚本的 findTemplate 算法（step=2 搜索 + 模板内部隔点采样），
// 在招募页截图上重算，看能否复现实跑的 score=41。
// 用法：node tools/repro-findtemplate.cjs <shot.png>
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

// 1920 → 1280（脚本 BASE_W/H）
function toLogical(dec) {
  const LW = 1280, LH = 720; const out = Buffer.alloc(LW * LH * 3);
  for (let y = 0; y < LH; y++) { const sy = Math.min(dec.H - 1, Math.round(y * dec.H / LH));
    for (let x = 0; x < LW; x++) { const sx = Math.min(dec.W - 1, Math.round(x * dec.W / LW));
      const si = sy * dec.stride + sx * dec.bpp, di = (y * LW + x) * 3;
      out[di] = dec.img[si]; out[di + 1] = dec.img[si + 1]; out[di + 2] = dec.img[si + 2]; } }
  return { W: LW, H: LH, data: out };
}

const shot = toLogical(decodePNG(fs.readFileSync(process.argv[2])));
const usSrc = fs.readFileSync(path.join(__dirname, '..', 'naruto-auto.user.js'), 'utf8');
const tmplDec = decodePNG(Buffer.from(usSrc.match(/RECRUIT_TAB_TMPL_SRC = 'data:image\/png;base64,' \+ '([A-Za-z0-9+/=]+)'/)[1], 'base64'));

// 复刻：模板灰度数组
const tw = tmplDec.W, th = tmplDec.H;
const tg = new Uint8Array(tw * th);
for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
  const i = y * tmplDec.stride + x * tmplDec.bpp;
  tg[y * tw + x] = (tmplDec.img[i] * 77 + tmplDec.img[i + 1] * 151 + tmplDec.img[i + 2] * 28) >> 8;
}

// 复刻 findTemplate：region=[8,90,159,700], step=2, 内部 +=2
const R = [8, 90, 159, 700];
const rw = R[2] - R[0], rh = R[3] - R[1];
const fg = new Uint8Array(rw * rh);
for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
  const i = ((R[1] + y) * shot.W + (R[0] + x)) * 3;
  fg[y * rw + x] = (shot.data[i] * 77 + shot.data[i + 1] * 151 + shot.data[i + 2] * 28) >> 8;
}

function run(step) {
  let best = { score: 1e9, x: -1, y: -1 };
  for (let ry = 0; ry + th <= rh; ry += step) {
    for (let rx = 0; rx + tw <= rw; rx += step) {
      let sad = 0, n = 0;
      for (let ty = 0; ty < th; ty += 2) {
        const frow = (ry + ty) * rw + rx, trow = ty * tw;
        for (let tx = 0; tx < tw; tx += 2) { sad += Math.abs(fg[frow + tx] - tg[trow + tx]); n++; }
      }
      const score = sad / n;
      if (score < best.score) best = { score, x: R[0] + rx, y: R[1] + ry };
      if (best.score === 0) break;
    }
    if (best.score === 0) break;
  }
  return best;
}

console.log(`模板 ${tw}x${th}  搜索区 [${R}]`);
for (const step of [2, 1]) {
  const b = run(step);
  console.log(`step=${step}: score=${b.score.toFixed(1)} @ (${b.x},${b.y})  中心=(${b.x + tw / 2},${b.y + th / 2})  ` +
    `${b.score <= 25 ? '✅命中' : '❌未命中'}`);
}
console.log('\n实跑日志: score=41.0（初始）/ 33.5（上滑后）');
console.log('若此处 step=2 也算出 ~17 → 说明实跑画面与这张截图不同（另有原因）');
