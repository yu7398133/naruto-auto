// 1) (830,555) 到底是什么？确认旧点击坐标是否早已失效（坐标错位）。
// 2) 给出左按钮真实中心点，供点击使用。
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

// 脚本坐标空间是 1280x720 视口，样本是 1920x1080 → 缩放 1.5
const SX = 1920 / 1280, SY = 1080 / 720;
console.log('缩放: x*' + SX + ' y*' + SY);
console.log('\n=== 旧点击点 (830,555) 在样本图中的位置 ===');
const ox = Math.round(830 * SX), oy = Math.round(555 * SY);
console.log(`  脚本(830,555) → 样本(${ox},${oy})  像素=${JSON.stringify(P(A, ox, oy))}`);
console.log('  ↑ 该处是「第1/6轮，累积投币」左侧的**进度条文字带**，不是按钮');

// 左按钮真实范围（金色框）：从 y=848 扫描已知 x∈[1108,1158] 是金框，
// 用 A 图找按钮的完整金色外框上下边界
console.log('\n=== 左按钮金色外框定位 (x∈[1108,1265]) ===');
let top = -1, bot = -1;
for (let y = 780; y < 940; y++) {
  let gold = 0, n = 0;
  for (let x = 1108; x < 1265; x++) { const [r, g, b] = P(A, x, y); n++; if (r > 200 && g > 140 && b < 130) gold++; }
  const pct = gold / n;
  if (pct > 0.5) { if (top < 0) top = y; bot = y; }
}
console.log(`  金色行范围: y=${top}..${bot}  中心y=${Math.round((top + bot) / 2)}`);

// 左右边界
let lft = -1, rgt = -1;
for (let x = 1050; x < 1300; x++) {
  let gold = 0, n = 0;
  for (let y = top; y <= bot; y++) { const [r, g, b] = P(A, x, y); n++; if (r > 200 && g > 140 && b < 130) gold++; }
  if (gold / n > 0.5) { if (lft < 0) lft = x; rgt = x; }
}
console.log(`  金色列范围: x=${lft}..${rgt}  中心x=${Math.round((lft + rgt) / 2)}`);
console.log(`\n  ⇒ 左按钮中心(样本) = (${Math.round((lft + rgt) / 2)}, ${Math.round((top + bot) / 2)})`);
console.log(`  ⇒ 换算回脚本坐标 = (${Math.round(((lft + rgt) / 2) / SX)}, ${Math.round(((top + bot) / 2) / SY)})`);
