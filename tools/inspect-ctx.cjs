// 查 __narutoAuto 的真实键，找到 nav/ctx 挂在哪
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages().find(x => /start\.qq\.com\/game/.test(x.url()));
  const r = await p.evaluate(() => {
    const A = window.__narutoAuto;
    if (!A) return { fatal: 'no __narutoAuto' };
    const out = { keys: Object.keys(A) };
    // 逐键看类型，找哪些是对象且带 goHome/tapExitConfirm
    out.detail = {};
    for (const k of Object.keys(A)) {
      const v = A[k];
      const t = typeof v;
      if (v && t === 'object') {
        const ks = Object.keys(v).slice(0, 40);
        out.detail[k] = {
          ctor: v.constructor && v.constructor.name,
          hasGoHome: typeof v.goHome,
          hasTapExitConfirm: typeof v.tapExitConfirm,
          hasDetectExitConfirm: typeof v.detectExitConfirm,
          hasReadTicketCount: typeof v.readTicketCount,
          hasAtSecretRealmPrep: typeof v.atSecretRealmPrep,
          hasCfg: !!v.cfg,
          hasConfig: !!v.config,
          keys: ks,
        };
      }
    }
    return out;
  }).catch(e => ({ fatal: e.message }));
  console.log('顶层键:', r.keys ? r.keys.join(', ') : r.fatal);
  if (r.detail) {
    for (const [k, v] of Object.entries(r.detail)) {
      if (v.hasGoHome !== 'undefined' || v.hasTapExitConfirm !== 'undefined' ||
          v.hasReadTicketCount !== 'undefined' || /nav|ctx|scheduler/i.test(k)) {
        console.log(`\n${k}: ctor=${v.ctor}`);
        console.log(`   goHome=${v.hasGoHome} tapExitConfirm=${v.hasTapExitConfirm} detectExitConfirm=${v.hasDetectExitConfirm}`);
        console.log(`   readTicketCount=${v.hasReadTicketCount} atSecretRealmPrep=${v.hasAtSecretRealmPrep} cfg=${v.hasCfg} config=${v.hasConfig}`);
      }
    }
  }
  await b.close();
})();
