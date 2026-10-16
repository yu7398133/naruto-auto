// 在样本上裁出指定区域并存成 PPM（可视核对用，零依赖）。
//
// 为什么需要：我必须**看见**区域里到底是什么，而不是继续拿数字反推画面。
//   （2026-10-16 教训：靠读数推断画面已翻车两次）
//
// 用法: node tools\crop-region.js <样本名> <x0,y0,x1,y1> <输出名> [放大倍数]
//   node tools\crop-region.js battle-arena-normal 80,20,420,70 hp-left-battle
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'samples');
const W = 1280, H = 720;

const name = process.argv[2];
const coords = (process.argv[3] || '').split(',').map(Number);
const outName = process.argv[4] || 'crop';
const scale = Math.max(1, parseInt(process.argv[5] || '4', 10));

if (!name || coords.length !== 4 || coords.some(isNaN)) {
  console.error('用法: node tools/crop-region.js <样本名> <x0,y0,x1,y1> <输出名> [放大倍数]');
  process.exit(1);
}

const buf = fs.readFileSync(path.join(DIR, name + '.raw'));
const [x0, y0, x1, y1] = coords;
const w = x1 - x0, h = y1 - y0;

// 放大后写 PPM（P6），再用 PowerShell 转 PNG；或直接给出可读文本摘要
const outW = w * scale, outH = h * scale;
const out = Buffer.alloc(outW * outH * 3);
for (let y = 0; y < outH; y++) {
  for (let x = 0; x < outW; x++) {
    const sx = x0 + Math.floor(x / scale), sy = y0 + Math.floor(y / scale);
    const si = (sy * W + sx) * 3, di = (y * outW + x) * 3;
    out[di] = buf[si]; out[di + 1] = buf[si + 1]; out[di + 2] = buf[si + 2];
  }
}
const header = Buffer.from(`P6\n${outW} ${outH}\n255\n`, 'ascii');
const p = path.join(DIR, outName + '.ppm');
fs.writeFileSync(p, Buffer.concat([header, out]));
console.log(`已存 ${p}  ${outW}x${outH} (源区域 ${w}x${h} @ ${x0},${y0} 放大${scale}x)`);

// 顺带打印逐列红色占比，直接看血条边界在哪
console.log('\n逐列「红」占比（R>90 且 R-G>45 且 R-B>35），每列 = 1 脚本像素：');
let cols = '';
for (let x = x0; x < x1; x++) {
  let red = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    const i = (y * W + x) * 3;
    const R = buf[i], G = buf[i + 1], B = buf[i + 2];
    if (R > 90 && R - G > 45 && R - B > 35) red++;
    n++;
  }
  const pct = Math.round(red / n * 100);
  cols += pct >= 80 ? '█' : pct >= 50 ? '▓' : pct >= 20 ? '▒' : pct > 0 ? '░' : '·';
}
console.log('  x=' + x0 + ' ' + cols + ' x=' + (x1 - 1));
