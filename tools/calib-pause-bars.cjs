// 标定「双竖条」暂停键检测的阈值：统计每帧的白条列簇结构。
// 用法：node tools/calib-pause-bars.cjs <dir1> [dir2 ...]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const REGION = [1200, 0, 1280, 80];   // 右上角搜索区（逻辑坐标）
const WHITE_LUMA = 150, WHITE_CHROMA = 60;
const MIN_COL = 12;                    // 一列至少这么多白像素才算"竖条的一部分"

(async () => {
  const dirs = process.argv.slice(2);
  const files = [];
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) if (f.endsWith('.jpg')) files.push(path.join(d, f));
  }
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = await browser.contexts()[0].newPage();
  await page.setContent('<canvas id=c></canvas>');

  console.log('file'.padEnd(34), 'bars  bar1(x,w)      bar2(x,w)      gap  heights');
  for (const fp of files) {
    const b64 = fs.readFileSync(fp).toString('base64');
    const r = await page.evaluate(async ({ b64, REGION, WHITE_LUMA, WHITE_CHROMA, MIN_COL }) => {
      const im = new Image();
      im.src = 'data:image/jpeg;base64,' + b64;
      await im.decode();
      const c = document.getElementById('c');
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(im, 0, 0);
      const sx = im.naturalWidth / 1280, sy = im.naturalHeight / 720;
      const lx = Math.round(REGION[0] * sx), ly = Math.round(REGION[1] * sy);
      const lw = Math.round((REGION[2] - REGION[0]) * sx), lh = Math.round((REGION[3] - REGION[1]) * sy);
      const d = ctx.getImageData(lx, ly, lw, lh).data;
      const colCnt = new Array(lw).fill(0);
      for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
        const i = (y * lw + x) * 4;
        const l = (d[i] * 77 + d[i + 1] * 151 + d[i + 2] * 28) >> 8;
        const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
        if (l >= WHITE_LUMA && mx - mn <= WHITE_CHROMA) colCnt[x]++;
      }
      // 连通列簇
      const clusters = [];
      let cur = null;
      for (let x = 0; x < lw; x++) {
        if (colCnt[x] >= MIN_COL) {
          if (!cur) cur = { a: x, b: x, peak: colCnt[x] };
          else { cur.b = x; cur.peak = Math.max(cur.peak, colCnt[x]); }
        } else if (cur) { clusters.push(cur); cur = null; }
      }
      if (cur) clusters.push(cur);
      const toLogical = cl => ({
        x: Math.round(REGION[0] + cl.a / sx),
        w: Math.round((cl.b - cl.a + 1) / sx),
        peak: cl.peak,
      });
      return { clusters: clusters.map(toLogical) };
    }, { b64, REGION, WHITE_LUMA, WHITE_CHROMA, MIN_COL });

    const cs = r.clusters;
    const desc = cs.length === 2
      ? `${String(cs[0].x).padStart(4)},${String(cs[0].w).padStart(2)}      ${String(cs[1].x).padStart(4)},${String(cs[1].w).padStart(2)}      ${String(cs[1].x - cs[0].x - cs[0].w).padStart(3)}  ${cs[0].peak}/${cs[1].peak}`
      : cs.map(c => `${c.x},${c.w}(p${c.peak})`).join(' ');
    console.log(path.basename(fp).padEnd(34), String(cs.length).padStart(4), ' ' + desc);
  }
  await page.close();
  await browser.close();
})();
