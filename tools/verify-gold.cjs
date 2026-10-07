// 验证「金色确定按钮」探针：在准备界面实时画面上，该区域应 NOT 命中。
// 判据：按钮区 y421~477 x542~731（1280 坐标），金色占比 + 均值色距。
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
      let r = 0, gg = 0, bb = 0, n = 0, gold = 0;
      for (let i = 0; i < d.length; i += 4) {
        const R = d[i], G = d[i + 1], B = d[i + 2];
        r += R; gg += G; bb += B; n++;
        if (R > 150 && G > 120 && B < 110) gold++;
      }
      const mean = [Math.round(r / n), Math.round(gg / n), Math.round(bb / n)];
      // 与按钮参考色 (214,183,111) 的色距
      const dist = Math.round(Math.sqrt((mean[0] - 214) ** 2 + (mean[1] - 183) ** 2 + (mean[2] - 111) ** 2));
      return { mean, goldPct: +(gold / n).toFixed(3), distToBtn: dist };
    };
    return {
      btnBody: stat(542, 421, 731, 477),   // 按钮主体（应 NOT 命中）
      btnTight: stat(550, 428, 720, 470),
      // 对照：准备界面其它位置
      leftArea: stat(100, 300, 300, 450),
      rightArea: stat(900, 300, 1100, 450),
      topBar: stat(540, 20, 740, 60),
    };
  }).catch(e => ({ fatal: e.message }));
  if (r.fatal) { console.log(r.fatal); await b.close(); return; }
  console.log('当前画面 = 准备界面（应全部 NOT 命中金色按钮）');
  console.log('区域             mean            gold%   distToBtn(参考214,183,111)');
  for (const [k, v] of Object.entries(r)) {
    console.log(`  ${k.padEnd(12)} (${v.mean.join(',').padEnd(14)}) ${String(v.goldPct).padStart(6)}  ${String(v.distToBtn).padStart(4)}`);
  }
  await b.close();
})();
