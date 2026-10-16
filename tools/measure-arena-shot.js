// 用退出确认探针的**已知正确判据**来验证 1.5 缩放假设。
//
// 关键：用户看到的是 1920x1080 截图，脚本坐标是 1280x720。
// 缩放因子 1.5 —— 但要**证明**它，不能假设。
//
// 已知锚点（SECRET_REALM_EXIT_CONFIRM_*，代码里注释说实测过）：
//   脚本坐标 _REGION=[542,421,731,477], _COLOR={214,183,111}, _CLICK=[637,449]
// 如果 1.5 成立，截图里对应区域应该是金色。
const fs = require('fs');
const zlib = require('zlib');

// ---- 极简 PNG 解码（只支持 8bit RGB/RGBA 非隔行）----
function decodePNG(buf) {
  let p = 8, w = 0, h = 0, ct = 0, bd = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bd = data[8]; ct = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : 1;
  if (bd !== 8 || ct === 3) throw new Error('不支持 bd=' + bd + ' ct=' + ct);
  const stride = w * ch;
  const out = Buffer.alloc(w * h * ch);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (ft === 1) v += a; else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 255;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { w, h, ch, data: out };
}

const img = decodePNG(fs.readFileSync(process.argv[2]));
console.log(`截图 ${img.w}x${img.h} ch=${img.ch}`);

const px = (x, y) => {
  const i = (y * img.w + x) * img.ch;
  return { r: img.data[i], g: img.data[i + 1], b: img.data[i + 2] };
};
const avg = (x0, y0, x1, y1) => {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const c = px(x, y); r += c.r; g += c.g; b += c.b; n++;
  }
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
};
const luma = (c) => Math.round((c.r * 77 + c.g * 151 + c.b * 28) / 256);

console.log('\n=== ① 验证缩放因子 1.5（用退出确认金色按钮当锚点）===');
// 脚本 _REGION=[542,421,731,477] 中心约 (636,449)
for (const [name, sx, sy] of [
  ['1.0x 假设', 636, 449],
  ['1.5x 假设', Math.round(636 * 1.5), Math.round(449 * 1.5)],
  ['2.0x 假设', 636 * 2, 449 * 2],
]) {
  const X = Math.round(sx), Y = Math.round(sy);
  if (X + 40 > img.w || Y + 20 > img.h) { console.log(`  ${name.padEnd(10)} (${X},${Y}) 越界`); continue; }
  const c = avg(X - 40, Y - 15, X + 40, Y + 15);
  const d = Math.abs(c.r - 214) + Math.abs(c.g - 183) + Math.abs(c.b - 111);
  console.log(`  ${name.padEnd(10)} (${X},${Y}) avg=(${c.r},${c.g},${c.b}) 距金色(214,183,111) d=${d}`);
}

console.log('\n=== ② ARENA_REWARD_ENTRY=[793,642] 在两种尺度下分别是什么色 ===');
for (const [name, X, Y] of [['脚本坐标原样', 793, 642], ['×1.5', 1190, 963]]) {
  if (X + 30 > img.w || Y + 30 > img.h) { console.log(`  ${name.padEnd(12)} (${X},${Y}) 越界`); continue; }
  const c = avg(X - 30, Y - 20, X + 30, Y + 20);
  console.log(`  ${name.padEnd(12)} (${X},${Y}) avg=(${c.r},${c.g},${c.b}) 亮度=${luma(c)}`);
}

console.log('\n=== ③ ARENA_PANEL_DIM_AREAS 五块（×1.5 换算）实测亮度 ===');
const AREAS = [[10, 30, 120, 100], [1160, 30, 1270, 100], [10, 620, 120, 700], [10, 300, 60, 450], [1220, 300, 1270, 450]];
AREAS.forEach(([x0, y0, x1, y1], i) => {
  const c = avg(Math.round(x0 * 1.5), Math.round(y0 * 1.5), Math.round(x1 * 1.5), Math.round(y1 * 1.5));
  const L = luma(c);
  console.log(`  #${i + 1} [${x0},${y0},${x1},${y1}] ×1.5 → 亮度=${L} ${L <= 80 ? '暗✓' : '亮✗'}`);
});
