// 用 Playwright 的浏览器环境量 PNG 图（无需 sharp）：在用户截图上找金色确定按钮。
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const imgPath = process.argv[2];
  const b64 = fs.readFileSync(imgPath).toString('base64');
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = await b.contexts()[0].newPage();
  const r = await p.evaluate(async (dataUrl) => {
    const img = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl;
    });
    const W = img.width, H = img.height;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, W, H).data;
    const px = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const isGold = (r, g2, b2) => r > 150 && g2 > 120 && b2 < 110;
    const out = { size: [W, H], rows: [], blocks: [] };
    for (let y = 0; y < H; y += 8) {
      let cnt = 0, xmin = 1e9, xmax = -1;
      for (let yy = y; yy < Math.min(y + 8, H); yy++)
        for (let x = 0; x < W; x++) {
          const [r2, g2, b2] = px(x, yy);
          if (isGold(r2, g2, b2)) { cnt++; if (x < xmin) xmin = x; if (x > xmax) xmax = x; }
        }
      if (cnt > 150) out.rows.push({ y, cnt, xmin, xmax });
    }
    // 16x16 密集块
    for (let by = 0; by + 16 <= H; by += 16)
      for (let bx = 0; bx + 16 <= W; bx += 16) {
        let c = 0;
        for (let y = by; y < by + 16; y++) for (let x = bx; x < bx + 16; x++) {
          const [r2, g2, b2] = px(x, y); if (isGold(r2, g2, b2)) c++;
        }
        if (c / 256 > 0.5) out.blocks.push({ bx, by, pct: +(c / 256).toFixed(2) });
      }
    return out;
  }, 'data:image/png;base64,' + b64).catch(e => ({ fatal: e.message }));
  await b.close();
  if (r.fatal) { console.log('ERR', r.fatal); return; }
  console.log('尺寸', r.size.join('x'));
  console.log('\n逐行金色（cnt>150）:');
  for (const x of r.rows) console.log(`  y=${String(x.y).padStart(4)} cnt=${String(x.cnt).padStart(6)} x=[${x.xmin},${x.xmax}]`);
  console.log('\n密集金色块（16x16 占比>0.5）聚合:');
  const band = {};
  for (const bl of r.blocks) { const k = Math.floor(bl.by / 32) * 32; (band[k] = band[k] || []).push(bl); }
  for (const [k, arr] of Object.entries(band).sort((a, c) => a[0] - c[0])) {
    const xs = arr.map(a => a.bx);
    const ys = arr.map(a => a.by);
    console.log(`  y ${k}~${Math.max(...ys) + 16}  x [${Math.min(...xs)},${Math.max(...xs) + 16}]  块数${arr.length}  占比${(arr.reduce((s, a) => s + a.pct, 0) / arr.length).toFixed(2)}`);
  }
})();
