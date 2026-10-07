// 验证「挑战券图标」探针的特异性：icon 区 vs 周围 vs 常见背景
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages().find(x => /start\.qq\.com\/game/.test(x.url()));
  const r = await p.evaluate(() => {
    const A = window.__narutoAuto;
    A.vision.capture(true);
    const g = A.vision.canvas.getContext('2d', { willReadFrequently: true });
    const stat = (x1, y1, x2, y2) => {
      const d = g.getImageData(x1, y1, x2 - x1, y2 - y1).data;
      let r = 0, gg = 0, bb = 0, n = 0, bright = 0, sat = 0, std = 0;
      const vals = [];
      for (let i = 0; i < d.length; i += 4) {
        const R = d[i], G = d[i + 1], B = d[i + 2];
        r += R; gg += G; bb += B; n++;
        const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
        if (mx > 90) bright++;
        if (mx - mn > 30) sat++;
        vals.push((R + G + B) / 3);
      }
      const m = vals.reduce((a, c) => a + c, 0) / vals.length;
      for (const v of vals) std += (v - m) ** 2;
      std = Math.sqrt(std / vals.length);
      return {
        mean: [Math.round(r / n), Math.round(gg / n), Math.round(bb / n)],
        brightPct: +(bright / n).toFixed(3), satPct: +(sat / n).toFixed(3), std: +std.toFixed(1),
      };
    };
    return {
      icon: stat(458, 632, 492, 666),      // 候选图标
      iconTight: stat(462, 636, 488, 662), // 更紧
      underIcon: stat(458, 668, 492, 674), // 图标正下方（应全暗）
      leftOfIcon: stat(420, 632, 456, 666),// 图标左侧（应暗）
      aboveIcon: stat(458, 600, 492, 630), // 图标上方（紫，应不同）
      digits: stat(496, 620, 536, 672),    // 券数数字区
      corner: stat(1100, 640, 1200, 700),  // 右下角（其它内容）
      topLeft: stat(20, 20, 100, 80),      // 左上角
      center: stat(600, 300, 700, 400),    // 屏幕中央
    };
  }).catch(e => ({ fatal: e.message }));
  if (r.fatal) { console.log(r.fatal); await b.close(); return; }
  console.log('区域                  mean            bright%  sat%   std');
  for (const [k, v] of Object.entries(r)) {
    console.log(`${k.padEnd(12)} (${v.mean.join(',').padEnd(13)}) ${String(v.brightPct).padStart(7)} ${String(v.satPct).padStart(6)} ${String(v.std).padStart(6)}`);
  }
  await b.close();
})();
