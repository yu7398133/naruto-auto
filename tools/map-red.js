// 二维热力图：把区域打印成「红/非红」字符画，直接看出血条矩形在哪。
//
// 为什么要二维：逐行占比会被头像/火焰艺术糊掉（2026-10-16 教训）。
//   血条是一个**横长矩形**，只有二维图能同时看到它的 x 起止和 y 起止。
//
// 用法: node tools\map-red.js <样本名> <x0,y0,x1,y1> [采样步长]
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'samples');
const W = 1280, H = 720;

const name = process.argv[2];
const c = (process.argv[3] || '').split(',').map(Number);
const step = parseInt(process.argv[4] || '4', 10);
if (!name || c.length !== 4) {
  console.error('用法: node tools/map-red.js <样本名> <x0,y0,x1,y1> [步长]');
  process.exit(1);
}
const [x0, y0, x1, y1] = c;

const buf = fs.readFileSync(path.join(DIR, name + '.raw'));
const isRed = (R, G, B) => R > 90 && R - G > 45 && R - B > 35;

console.log(`样本 ${name}  区域 (${x0},${y0})-(${x1},${y1})  每格=${step}x${step}px  █=红>80% ▓>50% ▒>20% ░>5% ·=无`);

// 顶部标尺
let ruler = '     ';
for (let x = x0; x < x1; x += step) {
  ruler += (Math.floor(x / step) % 5 === 0) ? '|' : ' ';
}
console.log(ruler);
console.log('x→   ' + String(x0).padEnd(4) + ' '.repeat(Math.max(0, Math.floor((x1 - x0) / step / 2) - 4)) + String(x1));

for (let y = y0; y < y1; y += step) {
  let line = '';
  for (let x = x0; x < x1; x += step) {
    let red = 0, n = 0;
    for (let dy = 0; dy < step && y + dy < y1; dy++) {
      for (let dx = 0; dx < step && x + dx < x1; dx++) {
        const i = ((y + dy) * W + (x + dx)) * 3;
        if (isRed(buf[i], buf[i + 1], buf[i + 2])) red++;
        n++;
      }
    }
    const p = red / n * 100;
    line += p >= 80 ? '█' : p >= 50 ? '▓' : p >= 20 ? '▒' : p > 5 ? '░' : '·';
  }
  console.log(`y=${String(y).padStart(3)} ${line}`);
}
