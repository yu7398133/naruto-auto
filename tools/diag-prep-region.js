// 用两张秘境战斗截图，直接算出 SECRET_REALM_PREP_ICON_REGION 的亮度/内容特征，
// 回答一个问题：为什么「战斗中」会被判成「不在准备界面」。
//
// 同时验证：真正的准备界面小图标 vs 战斗画面，在同一个区域里差异有多大。
const fs = require('fs'), path = require('path'), zlib = require('zlib');
function decodePNG(buf) {
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break;
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : 1;
  const stride = w * ch, out = Buffer.alloc(w * h * 3);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) { out[(y * w + x) * 3] = cur[x * ch]; out[(y * w + x) * 3 + 1] = cur[x * ch + 1]; out[(y * w + x) * 3 + 2] = cur[x * ch + 2]; }
    prev = cur;
  }
  return { w, h, data: out };
}
const P = (img, x, y) => { const i = (y * img.w + x) * 3; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
const D = process.env.USERPROFILE + '\\Desktop';
const files = [
  ['木叶赛事  ', 'naruto-fail-2026-10-15T09-53-33-#1.png'],
  ['主界面    ', 'naruto-fail-2026-10-15T09-54-28-#1.png'],
  ['烈炎秘境战', 'naruto-fail-2026-10-15T09-57-13-#2.png'],
  ['毒风秘境战', 'naruto-fail-2026-10-15T10-07-34-#3.png'],
];

// 脚本坐标 → 样本坐标（×1.5）
const SX = 1.5;
// SECRET_REALM_PREP_ICON_REGION = [440, 615, 510, 680]（脚本坐标，x1,y1,x2,y2）
const R = [440, 615, 510, 680];

console.log('=== 秘境准备图标区 [' + R.join(',') + '] 在各画面下的表现 ===');
console.log('（脚本坐标 → 样本 x[' + Math.round(R[0] * SX) + '..' + Math.round(R[2] * SX) +
  '] y[' + Math.round(R[1] * SX) + '..' + Math.round(R[3] * SX) + ']）\n');

function stats(img, r) {
  const x0 = Math.round(r[0] * SX), y0 = Math.round(r[1] * SX);
  const x1 = Math.round(r[2] * SX), y1 = Math.round(r[3] * SX);
  let n = 0, sum = 0, s2 = 0;
  const lums = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const [rr, gg, bb] = P(img, x, y);
    const l = (rr * 77 + gg * 151 + bb * 28) >> 8;
    sum += l; s2 += l * l; n++; lums.push(l);
  }
  const mean = sum / n, varr = Math.max(0, s2 / n - mean * mean);
  lums.sort((a, b) => a - b);
  return {
    mean: +mean.toFixed(1), std: +Math.sqrt(varr).toFixed(1),
    p10: lums[Math.floor(n * 0.1)], p50: lums[Math.floor(n * 0.5)], p90: lums[Math.floor(n * 0.9)],
    n
  };
}

const rows = [];
for (const [label, f] of files) {
  const p = path.join(D, f);
  if (!fs.existsSync(p)) { console.log('缺文件: ' + f); continue; }
  const img = decodePNG(fs.readFileSync(p));
  const s = stats(img, R);
  // 顺带看整个左下角区域，判断画面整体亮度
  const full = stats(img, [0, 0, 1280, 720]);
  rows.push({ label, ...s, fullMean: full.mean });
  console.log(` ${label}  区域均值=${s.mean}  std=${s.std}  p10/p50/p90=${s.p10}/${s.p50}/${s.p90}   （整屏均值=${full.mean}）`);
}

console.log('\n=== 结论判读 ===');
for (const r of rows) {
  const rel = (r.mean / r.fullMean).toFixed(2);
  console.log(` ${r.label}  图标区均值/整屏均值 = ${rel}` + (rel > 1.15 ? '  ← 明显比周围亮' : ''));
}
