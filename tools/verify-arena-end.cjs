// 用实机截图验证角斗场「结算图标」模板：复现 detectArenaEnd 的算法
// （region + step:1 + thresh:30），报告最优 SAD 与位置。
// 用法：node tools/verify-arena-end.cjs <shot.png>
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
const mkGray = (d) => { const g = new Uint8Array(d.W * d.H); for (let y = 0; y < d.H; y++) for (let x = 0; x < d.W; x++) { const i = y * d.stride + x * d.bpp; g[y * d.W + x] = (d.img[i] * 77 + d.img[i + 1] * 151 + d.img[i + 2] * 28) >> 8; } return g; };

const src = fs.readFileSync('naruto-auto.user.js', 'utf8');
const b64 = src.match(/const ARENA_END_ICON_TMPL = 'data:image\/png;base64,([A-Za-z0-9+/=]+)'/)[1];
const tmpl = decodePNG(Buffer.from(b64, 'base64'));
const tg = mkGray(tmpl);
console.log(`模板 ${tmpl.W}x${tmpl.H}`);

// 截图 → 1280x720 灰度
const shot = decodePNG(fs.readFileSync(process.argv[2]));
console.log(`截图 ${shot.W}x${shot.H}`);
const LW = 1280, LH = 720; const fg = new Uint8Array(LW * LH);
for (let y = 0; y < LH; y++) { const sy = Math.min(shot.H - 1, Math.round(y * shot.H / LH));
  for (let x = 0; x < LW; x++) { const sx = Math.min(shot.W - 1, Math.round(x * shot.W / LW));
    const i = sy * shot.stride + sx * shot.bpp;
    fg[y * LW + x] = (shot.img[i] * 77 + shot.img[i + 1] * 151 + shot.img[i + 2] * 28) >> 8; } }

// 复现 detectArenaEnd：region=[1095,2,1168,62], step:1, thresh:30
const R = [1095, 2, 1168, 62];
const rw = R[2] - R[0], rh = R[3] - R[1];
const tw = tmpl.W, th = tmpl.H;
if (tw > rw || th > rh) { console.log(`❌ 模板比搜索区大：模板 ${tw}x${th} > 区 ${rw}x${rh}`); process.exit(1); }
let best = { s: 1e9, x: -1, y: -1 };
for (let ry = 0; ry + th <= rh; ry++) {
  for (let rx = 0; rx + tw <= rw; rx++) {
    let sad = 0, n = 0;
    for (let ty = 0; ty < th; ty += 2) {
      const frow = (R[1] + ry + ty) * LW + (R[0] + rx), trow = ty * tw;
      for (let tx = 0; tx < tw; tx += 2) { sad += Math.abs(fg[frow + tx] - tg[trow + tx]); n++; }
    }
    const v = sad / n;
    if (v < best.s) best = { s: v, x: R[0] + rx, y: R[1] + ry };
  }
}
console.log(`\n=== detectArenaEnd 复现（搜索区 [${R}], 阈值 ${30}）===`);
console.log(`最优 SAD = ${best.s.toFixed(1)} @ (${best.x},${best.y})  中心=(${best.x + tw / 2},${best.y + th / 2})`);
console.log(best.s <= 30 ? '✅ 会命中（判定本场结束）' : '❌ 未命中 → 永不结束 ← 这就是本次 bug');

// 顺带把搜索区当前内容导出，便于肉眼比对
console.log(`\n搜索区在 1280 空间: x∈[${R[0]},${R[2]}] y∈[${R[1]},${R[3]}]`);
console.log(`对应 1920 空间:     x∈[${Math.round(R[0] * 1.5)},${Math.round(R[2] * 1.5)}] y∈[${Math.round(R[1] * 1.5)},${Math.round(R[3] * 1.5)}]`);
