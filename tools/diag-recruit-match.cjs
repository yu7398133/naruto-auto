// 在实机截图里找「普通招募」并诊断模板为何失配。
// 做法：
//   ① 用零依赖 PNG 解码读截图（只取 video 区域，按需缩放）
//   ② 在左侧菜单区扫描"白色文字行"，输出每个簇的位置/高度
//   ③ 把 userscript 里的 92x26 模板与每个簇位置做 SAD，报告最优分数
// 用法：node tools/diag-recruit-match.cjs <screenshot.png>
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function decodePNG(buf) {
  let off = 8, W = 0, H = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      W = data.readUInt32BE(0); H = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`不支持的 PNG: depth=${bitDepth} color=${colorType}`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = W * bpp;
  const img = Buffer.alloc(H * stride);
  let p = 0;
  for (let y = 0; y < H; y++) {
    const ft = raw[p++];
    const line = raw.subarray(p, p + stride); p += stride;
    const prev = y > 0 ? img.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = img.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[x] = v & 255;
    }
  }
  return { W, H, bpp, stride, img };
}

// 把截图缩放到 1280x720（脚本的逻辑分辨率）
function toLogical(dec) {
  const { W, H, bpp, stride, img } = dec;
  const LW = 1280, LH = 720;
  const out = Buffer.alloc(LW * LH * 3);
  for (let y = 0; y < LH; y++) {
    const sy = Math.min(H - 1, Math.round(y * H / LH));
    for (let x = 0; x < LW; x++) {
      const sx = Math.min(W - 1, Math.round(x * W / LW));
      const si = sy * stride + sx * bpp, di = (y * LW + x) * 3;
      out[di] = img[si]; out[di + 1] = img[si + 1]; out[di + 2] = img[si + 2];
    }
  }
  return { W: LW, H: LH, px: (x, y) => { const i = (y * LW + x) * 3; return [out[i], out[i + 1], out[i + 2]]; } };
}

function decodeDataURL(url) {
  const b64 = url.split(',')[1];
  return decodePNG(Buffer.from(b64, 'base64'));
}

(async () => {
  const shotPath = process.argv[2];
  if (!shotPath) { console.error('用法: node tools/diag-recruit-match.cjs <png>'); process.exit(1); }

  // ── 模板（92x26，逻辑分辨率） ──
  const src = fs.readFileSync(path.join(__dirname, '..', 'naruto-auto.user.js'), 'utf8');
  const m = src.match(/const RECRUIT_TAB_TMPL_SRC = 'data:image\/png;base64,' \+ '([A-Za-z0-9+/=]+)'/);
  const tdec = decodePNG(Buffer.from(m[1], 'base64'));
  const tmpl = { W: tdec.W, H: tdec.H, px: (x, y) => { const i = y * tdec.stride + x * tdec.bpp; return [tdec.img[i], tdec.img[i + 1], tdec.img[i + 2]]; } };
  console.log(`模板尺寸: ${tmpl.W}x${tmpl.H}`);

  // ── 截图 ──
  const gate = toLogical(decodePNG(fs.readFileSync(shotPath)));
  console.log(`截图逻辑尺寸: ${gate.W}x${gate.H}`);

  // 白字掩码（灰度>170 且低饱和）
  const isWhite = (c) => {
    const [r, g, b] = c;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const luma = (r * 77 + g * 151 + b * 28) >> 8;
    return luma > 170 && (mx - mn) < 60;
  };

  // 找菜单文字行（x∈[30,155]）
  console.log('\n=== 左侧菜单 x∈[30,155] 的白色文字行（y 聚类） ===');
  const rowCount = [];
  for (let y = 90; y < 700; y++) {
    let n = 0;
    for (let x = 30; x < 155; x++) if (isWhite(gate.px(x, y))) n++;
    rowCount.push({ y, n });
  }
  const clusters = [];
  let cur = null;
  for (const { y, n } of rowCount) {
    if (n >= 8) { if (!cur) cur = { y0: y, y1: y, max: n }; else { cur.y1 = y; cur.max = Math.max(cur.max, n); } }
    else if (cur) { if (cur.y1 - cur.y0 >= 6) clusters.push(cur); cur = null; }
  }
  if (cur && cur.y1 - cur.y0 >= 6) clusters.push(cur);
  for (const c of clusters) {
    console.log(`  行 y∈[${c.y0},${c.y1}]  高=${c.y1 - c.y0 + 1}  峰值白像素=${c.max}  中心y≈${Math.round((c.y0 + c.y1) / 2)}`);
  }

  // ── SAD 匹配 ──
  const sad = (ox, oy) => {
    let s = 0, n = 0;
    for (let y = 0; y < tmpl.H; y++) {
      for (let x = 0; x < tmpl.W; x++) {
        const t = tmpl.px(x, y), g = gate.px(ox + x, oy + y);
        s += Math.abs(((t[0] * 77 + t[1] * 151 + t[2] * 28) >> 8) - ((g[0] * 77 + g[1] * 151 + g[2] * 28) >> 8));
        n++;
      }
    }
    return s / n;
  };

  console.log('\n=== 模板 SAD（越小越像；脚本阈值 25）===');
  let best = { s: 1e9, x: 0, y: 0 };
  for (let oy = 90; oy < 700 - tmpl.H; oy += 2) {
    for (let ox = 8; ox <= 159 - tmpl.W; ox += 1) {
      const s = sad(ox, oy);
      if (s < best.s) best = { s, x: ox, y: oy };
    }
  }
  console.log(`  全区间最优: SAD=${best.s.toFixed(1)} @ (${best.x},${best.y})`);

  // 打印模板自身的亮度分布（看它是白字还是别的东西）
  let tmin = 255, tmax = 0, tsum = 0, tn = 0;
  for (let y = 0; y < tmpl.H; y++) for (let x = 0; x < tmpl.W; x++) {
    const c = tmpl.px(x, y); const l = (c[0] * 77 + c[1] * 151 + c[2] * 28) >> 8;
    tmin = Math.min(tmin, l); tmax = Math.max(tmax, l); tsum += l; tn++;
  }
  console.log(`\n模板亮度: min=${tmin} max=${tmax} 平均=${Math.round(tsum / tn)}`);
  console.log(`（若 max 不高 → 模板里没有白字；若 min 也很高 → 整块都很亮）`);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
