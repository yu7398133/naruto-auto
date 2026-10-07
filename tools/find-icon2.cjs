// 定位 x=460~490 亮块的 y 范围（候选：挑战券小图标）
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages().find(x => /start\.qq\.com\/game/.test(x.url()));
  const r = await p.evaluate(() => {
    const A = window.__narutoAuto;
    A.vision.capture(true);
    const g = A.vision.canvas.getContext('2d', { willReadFrequently: true });
    const rowStat = (y, x1, x2) => {
      const d = g.getImageData(x1, y, x2 - x1, 1).data;
      let r = 0, gg = 0, bb = 0, n = 0, bright = 0, sat = 0;
      for (let i = 0; i < d.length; i += 4) {
        const R = d[i], G = d[i + 1], B = d[i + 2];
        r += R; gg += G; bb += B; n++;
        const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
        if (mx > 90) bright++;
        if (mx - mn > 30) sat++;
      }
      return { mean: [Math.round(r / n), Math.round(gg / n), Math.round(bb / n)], bright, sat };
    };
    const out = { rows: [] };
    for (let y = 600; y < 700; y += 2) out.rows.push({ y, ...rowStat(y, 458, 492) });
    // 顺便：券数区正确性核对（找数字在哪）—— 横扫 x=490..560 的亮像素
    out.digits = [];
    for (let x = 490; x < 570; x += 4) out.digits.push({ x, ...rowStat(620, x, x + 4) });
    return out;
  }).catch(e => ({ fatal: e.message }));
  if (r.fatal) { console.log(r.fatal); await b.close(); return; }
  console.log('纵向扫描 x=458..492（找图标 y 范围）:');
  console.log('  y    mean            bright sat');
  for (const c of r.rows) {
    console.log(`  ${String(c.y).padStart(3)}  (${c.mean.join(',').padEnd(13)}) ${String(c.bright).padStart(5)} ${String(c.sat).padStart(4)}  ${'#'.repeat(c.bright)}`);
  }
  await b.close();
})();
