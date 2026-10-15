// 把最优区换算成脚本坐标，并在样本上**直接按脚本坐标采样验证**（避免换算错误）。
const fs = require('fs'), path = require('path'), zlib = require('zlib');
function decodePNG(buf) {
  let p = 8, w = 0, h = 0, bd = 0, ct = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
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
const dir = path.join(__dirname, 'zc');
const A = decodePNG(fs.readFileSync(path.join(dir, 'free.png')));
const B = decodePNG(fs.readFileSync(path.join(dir, 'zhaocai.png')));

const SX = A.w / 1280;   // 1.5
console.log('样本宽 ' + A.w + ' → 脚本视口 1280，缩放 ' + SX);

// 最优区（样本）→ 脚本
const TX0 = 1168, TY0 = 832, TX1 = 1256, TY1 = 862;
const sx0 = Math.round(TX0 / SX), sy0 = Math.round(TY0 / SX);
const sx1 = Math.round(TX1 / SX), sy1 = Math.round(TY1 / SX);
console.log('\n脚本坐标区 = [' + [sx0, sy0, sx1, sy1].join(',') + ']');
// 反算回样本，确认覆盖文字
console.log('反算样本 x[' + Math.round(sx0 * SX) + '..' + Math.round(sx1 * SX) + '] y[' + Math.round(sy0 * SX) + '..' + Math.round(sy1 * SX) + ']');

// 按脚本坐标（乘回 SX）在样本上采样
function scoreScript(img, a) {
  const [x0, y0, x1, y1] = a;
  let n = 0, bright = 0, dark = 0;
  for (let sy = y0; sy < y1; sy++) for (let sxx = x0; sxx < x1; sxx++) {
    const x = Math.round(sxx * SX), y = Math.round(sy * SX);
    if (x >= img.w || y >= img.h) continue;
    const [r, g, b] = P(img, x, y); n++;
    if (r > 230 && g > 230 && b < 180) bright++;
    if (r < 80 && g < 80 && b < 80) dark++;
  }
  return { n, bright: +(100 * bright / n).toFixed(1), dark: +(100 * dark / n).toFixed(1) };
}
const AREA = [sx0, sy0, sx1, sy1];
const sa = scoreScript(A, AREA), sb = scoreScript(B, AREA);
console.log('\n=== 按脚本坐标在本机真图上采样 ===');
console.log(' 免费一次态: 亮黄=' + sa.bright + '%  暗=' + sa.dark + '%   (样本点 ' + sa.n + ')');
console.log(' 招财态    : 亮黄=' + sb.bright + '%  暗=' + sb.dark + '%   (样本点 ' + sb.n + ')');
console.log(' 分离度: 亮黄 ' + (sa.bright / Math.max(sb.bright, 0.01)).toFixed(1) + 'x , 暗 ' + (sb.dark / Math.max(sa.dark, 0.01)).toFixed(0) + 'x');

// 三态判定逻辑的门限建议
console.log('\n=== 判据与门限建议 ===');
console.log(' 免费一次（正向）: 亮黄占比 >= 8%  → 实测 ' + sa.bright + '% (免费) vs ' + sb.bright + '% (招财)');
console.log(' 招财态（反向）  : 暗占比   >= 4%  → 实测 ' + sb.dark + '% (招财) vs ' + sa.dark + '% (免费)');
console.log(' 场景错误        : 两者都不满足');

// 额外：整体按钮金色占比（作为第三重交叉确认）
function goldScript(img) {
  let n = 0, g = 0;
  for (let y = 535; y < 592; y++) for (let x = 741; x < 867; x++) {
    const X = Math.round(x * SX), Y = Math.round(y * SX);
    const [r, gg, b] = P(img, X, Y); n++;
    if (r > 200 && gg > 140 && b < 130) g++;
  }
  return +(100 * g / n).toFixed(1);
}
console.log('\n 整按钮金色占比: 免费=' + goldScript(A) + '%  招财=' + goldScript(B) + '%  (仅作场景存在性确认，不作状态判据)');
