// 精确取色：把「战斗血条红」和「主界面红」的实际 RGB 分布打出来，看是否可分。
//
// 用户判断（2026-10-16）：主界面的红色和战斗血条的红色**不是同一种红**，可以精准写颜色。
// 本脚本验证这个判断：取区域内「偏红」像素的 RGB 直方图/众数，做色距分离。
//
// 用法: node tools\color-hist.js <样本名> <x0,y0,x1,y1>
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'samples');
const W = 1280, H = 720;

const name = process.argv[2];
const c = (process.argv[3] || '').split(',').map(Number);
if (!name || c.length !== 4) {
  console.error('用法: node tools/color-hist.js <样本名> <x0,y0,x1,y1>');
  process.exit(1);
}
const [x0, y0, x1, y1] = c;

const buf = fs.readFileSync(path.join(DIR, name + '.raw'));

// 收集「偏红」像素（R 明显高于 G/B），按 R 分桶
const buckets = new Map();
let redN = 0, total = 0;
for (let y = y0; y < y1; y++) {
  for (let x = x0; x < x1; x++) {
    const i = (y * W + x) * 3;
    const R = buf[i], G = buf[i + 1], B = buf[i + 2];
    total++;
    if (R - G > 30 && R - B > 25) {
      redN++;
      // 量化到 16 级
      const k = `${R >> 4 << 4},${G >> 4 << 4},${B >> 4 << 4}`;
      const e = buckets.get(k) || { n: 0, r: 0, g: 0, b: 0 };
      e.n++; e.r += R; e.g += G; e.b += B;
      buckets.set(k, e);
    }
  }
}

console.log(`样本 ${name}  区域 (${x0},${y0})-(${x1},${y1})`);
console.log(`偏红像素 ${redN}/${total} = ${(redN / total * 100).toFixed(1)}%\n`);
if (!redN) { console.log('无偏红像素'); process.exit(0); }

// 全局平均
let ar = 0, ag = 0, ab = 0;
for (const e of buckets.values()) { ar += e.r; ag += e.g; ab += e.b; }
console.log(`偏红像素总体均值 = (${Math.round(ar / redN)}, ${Math.round(ag / redN)}, ${Math.round(ab / redN)})`);

// 前 12 个主流色
const top = [...buckets.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 12);
console.log('\n主要色块（量化桶 → 实际均值，占比）：');
for (const [k, e] of top) {
  const R = e.r / e.n, G = e.g / e.n, B = e.b / e.n;
  console.log(`  ${(e.n / redN * 100).toFixed(1).padStart(5)}%  avg=(${Math.round(R)},${Math.round(G)},${Math.round(B)})  桶${k}`);
}

// 也输出「高饱和纯红」占比（血条通常更饱和）
let vivid = 0;
for (const e of buckets.values()) {
  const R = e.r / e.n, G = e.g / e.n, B = e.b / e.n;
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
  const sat = mx ? (mx - mn) / mx : 0;
  if (sat > 0.6) vivid += e.n;
}
console.log(`\n高饱和(sat>0.6)偏红像素占比 = ${(vivid / total * 100).toFixed(1)}%  (占偏红像素的 ${(vivid / redN * 100).toFixed(1)}%)`);
