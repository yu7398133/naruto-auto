// 精确定位暂停键白条：在给定区域内找出"高亮近中性"像素的行列分布。
// 用法：node tools/locate-pause-bars.cjs <frame.jpg> [x1 y1 x2 y2]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const img = process.argv[2];
  const R = process.argv.length >= 7
    ? process.argv.slice(3, 7).map(Number) : [1180, 0, 1280, 80];

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = await browser.contexts()[0].newPage();
  await page.setContent('<canvas id=c></canvas>');
  const b64 = fs.readFileSync(img).toString('base64');

  const out = await page.evaluate(async ({ b64, R }) => {
    const im = new Image();
    im.src = 'data:image/jpeg;base64,' + b64;
    await im.decode();
    const c = document.getElementById('c');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(im, 0, 0);
    const sx = im.naturalWidth / 1280, sy = im.naturalHeight / 720;
    const lx = Math.round(R[0] * sx), ly = Math.round(R[1] * sy);
    const lw = Math.round((R[2] - R[0]) * sx), lh = Math.round((R[3] - R[1]) * sy);
    const d = ctx.getImageData(lx, ly, lw, lh).data;

    const isWhite = i => {
      const l = (d[i] * 77 + d[i + 1] * 151 + d[i + 2] * 28) >> 8;
      const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
      return l >= 150 && mx - mn <= 60;
    };
    const colCnt = new Array(lw).fill(0), rowCnt = new Array(lh).fill(0);
    let total = 0;
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
      if (!isWhite((y * lw + x) * 4)) continue;
      total++; colCnt[x]++; rowCnt[y]++;
    }
    // 原图坐标（逻辑）
    const cols = colCnt.map((v, i) => [Math.round(R[0] + i / sx), v]).filter(([, v]) => v > 0);
    const rows = rowCnt.map((v, i) => [Math.round(R[1] + i / sy), v]).filter(([, v]) => v > 0);
    return { lw, lh, total, pct: +(total / (lw * lh) * 100).toFixed(2), cols, rows };
  }, { b64, R });

  console.log('region', R.join(','), 'logical px', out.lw + 'x' + out.lh);
  console.log('white pixels:', out.total, '(' + out.pct + '%)');
  console.log('white cols (x:count):', out.cols.map(([x, v]) => `${x}:${v}`).join(' '));
  console.log('white rows (y:count):', out.rows.map(([y, v]) => `${y}:${v}`).join(' '));
  await page.close();
  await browser.close();
})();
