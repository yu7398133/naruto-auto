// 取「秘境探险」金字带核心区的平均色 + 对照其他页面的分离度
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
        r += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++;
        if (d[i] > 150 && d[i + 1] > 120 && d[i + 2] < 110) gold++;
      }
      return {
        mean: [Math.round(r / n), Math.round(gg / n), Math.round(bb / n)],
        goldPct: +(gold / n).toFixed(3),
      };
    };
    const out = {};
    // 候选探针区
    out.cand = stat(130, 66, 310, 94);
    out.cand2 = stat(135, 70, 300, 90);
    // 同 y 带的其它 x（应低）—— 检验横向特异性
    out.leftX0 = stat(0, 66, 120, 94);
    out.rightX = stat(320, 66, 400, 94);
    // 其它 y 带（应低）—— 检验纵向特异性
    out.above = stat(130, 30, 310, 60);
    out.below = stat(130, 100, 310, 130);
    return out;
  }).catch(e => ({ fatal: e.message }));
  if (r.fatal) { console.log(r.fatal); await b.close(); return; }
  const show = (n, v) => console.log(`  ${n.padEnd(10)} mean=(${String(v.mean).padEnd(14)}) gold%=${v.goldPct}`);
  console.log('候选探针区:');
  show('130,66,310,94', r.cand);
  show('135,70,300,90', r.cand2);
  console.log('\n特异性对照（应显著更低）:');
  show('左 0,66,120,94', r.leftX0);
  show('右 320,66,400,94', r.rightX);
  show('上 130,30,310,60', r.above);
  show('下 130,100,310,130', r.below);
  await b.close();
})();
