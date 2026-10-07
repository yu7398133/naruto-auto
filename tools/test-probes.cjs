// 实测两个新探针在真实画面上的表现（需先推送脚本 + 刷新页面）
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages().find(x => /start\.qq\.com\/game/.test(x.url()));
  const r = await p.evaluate(async () => {
    const A = window.__narutoAuto;
    if (!A) return { fatal: 'no __narutoAuto' };
    const out = { ver: null, scene: null };
    try { out.ver = A.runtime && A.runtime.version; } catch (e) {}
    try { out.scene = A.scenes.detect(false).scene; } catch (e) {}
    const ctx = A.scheduler && A.scheduler.ctx;
    if (!ctx) return { ...out, fatal: 'no scheduler.ctx' };
    out.hasPrep = typeof ctx.atSecretRealmPrep === 'function';
    out.hasExit = typeof ctx.detectExitConfirm === 'function';
    try { out.prep = await ctx.atSecretRealmPrep(); } catch (e) { out.prep = { err: e.message }; }
    try { out.exitC = ctx.detectExitConfirm(); } catch (e) { out.exitC = { err: e.message }; }
    // 券数也读一次（对照）
    try { out.ticket = await ctx.readTicketCount(); } catch (e) { out.ticket = { err: e.message }; }
    return out;
  }).catch(e => ({ fatal: e.message }));
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
