// 垂直扫描：找出「红色横条」在 y 轴上到底在哪一行。
//
// 为什么要这样找：2026-10-16 我把区域框在 y=20..70，实拍出来是**角色头像的橙色火焰**，
//   不是血条。教训 = 不要按截图目测坐标，要让像素自己说它在哪一行。
//
// 判据：逐行统计「红像素占比」，血条行会是一段连续的高占比带。
// 用法: node tools\scan-hp-rows.js <样本名> <x0,x1> [y0,y1]
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'samples');
const W = 1280, H = 720;

const name = process.argv[2];
const xr = (process.argv[3] || '60,430').split(',').map(Number);
const yr = (process.argv[4] || '0,140').split(',').map(Number);
if (!name || xr.length !== 2) {
  console.error('用法: node tools/scan-hp-rows.js <样本名> <x0,x1> [y0,y1]');
  process.exit(1);
}

const buf = fs.readFileSync(path.join(DIR, name + '.raw'));
const [x0, x1] = xr, [y0, y1] = yr;

console.log(`样本 ${name}  x=${x0}..${x1}  y=${y0}..${y1}`);
console.log('每行：红占比% + 平均RGB\n');

const isRed = (R, G, B) => R > 90 && R - G > 45 && R - B > 35;

for (let y = y0; y < y1; y++) {
  let red = 0, n = 0, r = 0, g = 0, b = 0;
  for (let x = x0; x < x1; x++) {
    const i = (y * W + x) * 3;
    const R = buf[i], G = buf[i + 1], B = buf[i + 2];
    r += R; g += G; b += B; n++;
    if (isRed(R, G, B)) red++;
  }
  const pct = red / n * 100;
  const bar = pct >= 80 ? '█' : pct >= 50 ? '▓' : pct >= 20 ? '▒' : pct > 5 ? '░' : '·';
  console.log(`  y=${String(y).padStart(3)}  ${pct.toFixed(1).padStart(5)}%  ${bar.repeat(Math.round(pct / 2))}  avg=(${Math.round(r/n)},${Math.round(g/n)},${Math.round(b/n)})`);
}
