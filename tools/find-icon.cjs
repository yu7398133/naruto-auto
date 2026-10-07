// 定位「挑战券」小图标：在券数区左侧逐列扫，找「有成片非背景色」的列范围。
// 判据：图标是有明确色相的图形块；背景是暗色场景。逐列统计「明显亮于周围」的像素数。
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages().find(x => /start\.qq\.com\/game/.test(x.url()));
  const r = await p.evaluate(() => {
    const A = window.__narutoAuto;
    A.vision.capture(true);
    const g = A.vision.canvas.getContext('2d', { willReadFrequently: true });
    // 券数区 [496,620,40,52] → y 620..672。取更宽的带看左右
    const Y1 = 612, Y2 = 680;
    const colStat = (x) => {
      const d = g.getImageData(x, Y1, 1, Y2 - Y1).data;
      let r = 0, gg = 0, bb = 0, n = 0, bright = 0, sat = 0;
      for (let i = 0; i < d.length; i += 4) {
        const R = d[i], G = d[i + 1], B = d[i + 2];
        r += R; gg += G; bb += B; n++;
        const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
        if (mx > 90) bright++;
        if (mx - mn > 40) sat++;      // 有彩度 = 有色相（图标/金框）
      }
      return { mean: [Math.round(r / n), Math.round(gg / n), Math.round(bb / n)], bright, sat };
    };
    const out = [];
    for (let x = 400; x < 620; x += 4) out.push({ x, ...colStat(x) });
    // 同时把整条带的横向缩略（每 8px 一格的均值）打出来
    return { cols: out, base: colStat(420) };
  }).catch(e => ({ fatal: e.message }));
  if (r.fatal) { console.log(r.fatal); await b.close(); return; }
  console.log(`背景参考列 x=420: mean=(${r.base.mean.join(',')}) bright=${r.base.bright} sat=${r.base.sat}\n`);
  console.log(' x    mean            bright  sat  柱状(bright) / 彩度(sat)');
  for (const c of r.cols) {
    const bb = '#'.repeat(Math.round(c.bright / 2));
    const ss = '*'.repeat(Math.round(c.sat / 2));
    console.log(`${String(c.x).padStart(4)}  (${c.mean.join(',').padEnd(13)}) ${String(c.bright).padStart(5)} ${String(c.sat).padStart(4)}  ${bb}${ss}`);
  }
  await b.close();
})();
