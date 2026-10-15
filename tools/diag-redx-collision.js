// 关键验证：木叶赛事页右上角的红✕，是否会命中 PROBES.closeX？
//
// 背景：realmNavGated() 用 sawRedX() 当作「已进入第 2 场景」的闸门。
// 若木叶赛事页的红✕也命中 closeX，那闸门就形同虚设 —— 脚本会以为
// 「进对页面了」，然后继续点后续导航坐标，一路跑偏。
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
const SX = 1.5;
const D = process.env.USERPROFILE + '\\Desktop';

// closeX 探针：area [1185,2,1272,70]，color(102,56,34)，tol 35，minStd 10
const CLOSE_X = { area: [1185, 2, 1272, 70], color: { r: 102, g: 56, b: 34 }, tol: 35, minStd: 10 };
// backBtnX 探针：area [1040,0,1280,120]，color(170,45,14)，tol 45，minStd 0
const BACK_X = { area: [1040, 0, 1280, 120], color: { r: 170, g: 45, b: 14 }, tol: 45, minStd: 0 };

function measure(img, probe) {
  const [x1, y1, x2, y2] = probe.area;
  const X0 = Math.round(x1 * SX), Y0 = Math.round(y1 * SX);
  const X1 = Math.round(x2 * SX), Y1 = Math.round(y2 * SX);
  let n = 0, sr = 0, sg = 0, sb = 0;
  const lums = [];
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
    const i = (y * img.w + x) * 3;
    sr += img.data[i]; sg += img.data[i + 1]; sb += img.data[i + 2];
    lums.push((img.data[i] * 77 + img.data[i + 1] * 151 + img.data[i + 2] * 28) >> 8);
    n++;
  }
  const avg = { r: sr / n, g: sg / n, b: sb / n };
  const mean = lums.reduce((a, b) => a + b, 0) / n;
  const varr = lums.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
  const std = Math.sqrt(varr);
  // dist = SAD 均值（脚本 dist() 的实现：|dr|+|dg|+|db| 平均）
  const dist = (Math.abs(avg.r - probe.color.r) + Math.abs(avg.g - probe.color.g) + Math.abs(avg.b - probe.color.b)) / 1;
  const stdOk = std >= (probe.minStd || 0);
  const ok = dist <= probe.tol && stdOk;
  return { avg, std, dist, stdOk, ok, n };
}

const files = [
  ['木叶赛事(红叉页)', 'naruto-fail-2026-10-15T09-53-33-#1.png'],
  ['主界面          ', 'naruto-fail-2026-10-15T09-54-28-#1.png'],
  ['烈炎秘境战      ', 'naruto-fail-2026-10-15T09-57-13-#2.png'],
  ['毒风秘境战      ', 'naruto-fail-2026-10-15T10-07-34-#3.png'],
];

console.log('=== sawRedX() 用 closeX 判「是否进了第 2 场景」===');
console.log(`探针 closeX: area=[${CLOSE_X.area}] 期望色=(${CLOSE_X.color.r},${CLOSE_X.color.g},${CLOSE_X.color.b}) tol=${CLOSE_X.tol} minStd=${CLOSE_X.minStd}\n`);
for (const [label, f] of files) {
  const p = path.join(D, f);
  if (!fs.existsSync(p)) { console.log('缺: ' + f); continue; }
  const img = decodePNG(fs.readFileSync(p));
  const m = measure(img, CLOSE_X);
  console.log(` ${label}  实测色=(${m.avg.r.toFixed(0)},${m.avg.g.toFixed(0)},${m.avg.b.toFixed(0)})` +
    `  d=${m.dist.toFixed(1)}/${CLOSE_X.tol}  std=${m.std.toFixed(1)}/${CLOSE_X.minStd}` +
    `  → sawRedX=${m.ok ? '✅ 命中' : '❌ 未命中'}`);
}

console.log('\n=== findRedX() 用 backBtnX 判「二级页返回键」===');
console.log(`探针 backBtnX: area=[${BACK_X.area}] 期望色=(${BACK_X.color.r},${BACK_X.color.g},${BACK_X.color.b}) tol=${BACK_X.tol}\n`);
for (const [label, f] of files) {
  const p = path.join(D, f);
  if (!fs.existsSync(p)) continue;
  const img = decodePNG(fs.readFileSync(p));
  const m = measure(img, BACK_X);
  console.log(` ${label}  实测色=(${m.avg.r.toFixed(0)},${m.avg.g.toFixed(0)},${m.avg.b.toFixed(0)})` +
    `  d=${m.dist.toFixed(1)}/${BACK_X.tol}  → ${m.ok ? '✅ 命中' : '❌ 未命中'}`);
}
