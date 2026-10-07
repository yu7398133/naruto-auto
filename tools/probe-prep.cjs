// 在准备界面上量「秘境探险」金字带的位置与颜色，并顺便验证券数区。
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages().find(x => /start\.qq\.com\/game/.test(x.url()));
  if (!p) { console.log('无游戏页'); await b.close(); return; }
  const r = await p.evaluate(() => {
    const A = window.__narutoAuto;
    A.vision.capture(true);
    const cv = A.vision.canvas;
    const g = cv.getContext('2d', { willReadFrequently: true });
    const out = { scene: null };
    try { out.scene = A.scenes.detect(false).scene; } catch (e) { out.scene = 'err'; }

    const regionStats = (x1, y1, x2, y2) => {
      const d = g.getImageData(x1, y1, x2 - x1, y2 - y1).data;
      let r = 0, gg = 0, bb = 0, n = 0, mx = 0;
      const hist = {};
      for (let i = 0; i < d.length; i += 4) {
        r += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++;
        // 金色像素计数：R>150, G>120, B<110
        if (d[i] > 150 && d[i + 1] > 120 && d[i + 2] < 110) mx++;
      }
      return { mean: [Math.round(r / n), Math.round(gg / n), Math.round(bb / n)], goldPct: +(mx / n).toFixed(3), n };
    };

    // ① 左上角逐 8px 横扫，找金字带（金色占比高的行）
    out.rows = [];
    for (let y = 0; y < 140; y += 8) {
      const s = regionStats(0, y, 340, y + 8);
      out.rows.push({ y, mean: s.mean, goldPct: s.goldPct });
    }
    // ② 券数区
    out.ticket = regionStats(496, 620, 536, 672);
    // ③ 券数左侧（"挑战券"文字带）
    out.ticketLeft = regionStats(380, 620, 500, 672);
    // ④ 顶部整条
    out.top = regionStats(0, 0, 1280, 60);
    return out;
  }).catch(e => ({ fatal: e.message }));
  if (r.fatal) { console.log(r.fatal); await b.close(); return; }
  console.log('scene =', r.scene);
  console.log('\n左上角逐行（找金色标题带）：');
  console.log('  y     mean           gold%');
  for (const row of r.rows) {
    const bar = '#'.repeat(Math.round(row.goldPct * 60));
    console.log(`  ${String(row.y).padStart(3)}  (${row.mean.join(',').padEnd(14)}) ${String(row.goldPct).padStart(6)} ${bar}`);
  }
  console.log('\n券数区 496,620,536,672 :', JSON.stringify(r.ticket));
  console.log('券数左 380,620,500,672 :', JSON.stringify(r.ticketLeft));
  console.log('顶部条 0,0,1280,60     :', JSON.stringify(r.top));
  await b.close();
})();
