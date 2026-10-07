// 精细定位「秘境探险」金字带的 x/y 边界
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages().find(x => /start\.qq\.com\/game/.test(x.url()));
  const r = await p.evaluate(() => {
    const A = window.__narutoAuto;
    A.vision.capture(true);
    const g = A.vision.canvas.getContext('2d', { willReadFrequently: true });
    const goldRow = (x1, y1, x2, y2) => {
      const d = g.getImageData(x1, y1, x2 - x1, y2 - y1).data;
      let m = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 150 && d[i + 1] > 120 && d[i + 2] < 110) m++;
        n++;
      }
      return +(m / n).toFixed(3);
    };
    const out = { xScan: [], yScan: [] };
    // 竖扫：y=60..100 逐 4px
    for (let y = 56; y < 104; y += 4) out.yScan.push({ y, g: goldRow(0, y, 340, y + 4) });
    // 横扫：x=0..340 逐 20px，在 y=64..92 带内
    for (let x = 0; x < 340; x += 20) out.xScan.push({ x, g: goldRow(x, 64, x + 20, 92) });
    return out;
  }).catch(e => ({ fatal: e.message }));
  if (r.fatal) { console.log(r.fatal); await b.close(); return; }
  console.log('竖扫 y（x=0..340）:');
  for (const r2 of r.yScan) console.log(`  y=${String(r2.y).padStart(3)} ${String(r2.g).padStart(6)} ${'#'.repeat(Math.round(r2.g * 50))}`);
  console.log('\n横扫 x（y=64..92）:');
  for (const r2 of r.xScan) console.log(`  x=${String(r2.x).padStart(3)} ${String(r2.g).padStart(6)} ${'#'.repeat(Math.round(r2.g * 50))}`);
  await b.close();
})();
