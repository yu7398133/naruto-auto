// 验证 v0.6.07：等 __narutoAuto.nav 就绪后再检查
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages().find(x => /start\.qq\.com\/game/.test(x.url()));
  // 先等就绪
  await p.waitForFunction(() => window.__narutoAuto && window.__narutoAuto.nav, { timeout: 20000 }).catch(() => {});
  const r = await p.evaluate(() => {
    const A = window.__narutoAuto;
    if (!A || !A.nav) return { fatal: 'nav 未就绪' };
    const out = { ver: A.runtime && A.runtime.version };
    out.nav_goHome = typeof A.nav.goHome;
    out.nav_tapExitConfirm = typeof A.nav.tapExitConfirm;
    out.nav_detectExitConfirm = typeof A.nav.detectExitConfirm;
    out.nav_vision = !!A.nav.vision;
    out.nav_config = !!A.nav.config;
    // ctx 侧
    const ctx = A.scheduler && A.scheduler.ctx;
    out.ctx_exists = !!ctx;
    if (ctx) {
      out.ctx_cfg = !!(ctx.cfg && typeof ctx.cfg.get === 'function');
      out.switchDefault = ctx.cfg.get('secretRealm.ignoreZeroTicket');
      out.ctx_readTicketCount = typeof ctx.readTicketCount;
      out.ctx_atSecretRealmPrep = typeof ctx.atSecretRealmPrep;
      out.ctx_realmTicketDoneExit = typeof ctx.realmTicketDoneExit;
      out.ctx_leaked_tapExitConfirm = typeof ctx.tapExitConfirm; // 应为 undefined
    }
    // 实跑探测（当前应不在弹窗）
    try { out.detectNow = A.nav.detectExitConfirm(); } catch (e) { out.detectNow = 'err:' + e.message; }
    return out;
  }).catch(e => ({ fatal: e.message }));
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
