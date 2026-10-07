// 量 goHome 单轮耗时：场景探测花了多久
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages().find(x => /start\.qq\.com\/game/.test(x.url()));
  if (!p) { console.log('无游戏页'); await b.close(); return; }
  const r = await p.evaluate(async () => {
    const A = window.__narutoAuto;
    const out = {};
    // 1. 场景探测耗时（goHome 每轮调 detectScene）
    const t0 = performance.now();
    let sc = null, err = null;
    try { sc = A.scenes.detect(false).scene; } catch (e) { err = e.message; }
    out.detectMs = Math.round(performance.now() - t0);
    out.scene = sc;
    out.err = err;
    // 2. 连测 5 次看稳定性
    const arr = [];
    for (let i = 0; i < 5; i++) {
      const t = performance.now();
      try { A.scenes.detect(false); } catch (e) {}
      arr.push(Math.round(performance.now() - t));
    }
    out.detect5 = arr;
    // 3. 当前配置
    out.cfg = {
      homeSettleMs: A.config.num('nav.homeSettleMs'),
      homeConfirmGap: A.config.num('nav.homeConfirmGap'),
      blindBack: A.config.get('nav.blindBack'),
      useEsc: A.config.get('nav.useEsc'),
      backSpots: A.config.get('nav.backSpots'),
    };
    return out;
  }).catch(e => ({ fatal: e.message }));
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
