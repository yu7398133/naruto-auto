// 验证 v0.5.99：券刷光退出方法存在 + 常量正确。不真点，只看结构。
const { chromium } = require('playwright');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages().find(x => /start\.qq\.com\/game/.test(x.url()));
  if (!p) { log('✗ 无游戏页'); await b.close(); return; }

  const r = await p.evaluate(() => {
    const A = window.__narutoAuto;
    const out = { ver: null, hasMethod: false, methodSrc: null, ctxKeys: [] };
    const ctx = A.runtime && A.runtime.ctx;
    if (!ctx) return { err: 'no runtime.ctx' };
    out.hasMethod = typeof ctx.realmTicketDoneExit === 'function';
    if (out.hasMethod) out.methodSrc = ctx.realmTicketDoneExit.toString().slice(0, 120);
    out.ctxKeys = Object.keys(Object.getPrototypeOf(ctx)).filter(k => /realm|ticket|home|settle/i.test(k));
    // 探常量（在 IIFE 里，未必能直接读；能读就读）
    try { out.done = A.config.get ? 'cfg-ok' : null; } catch (e) {}
    return out;
  }).catch(e => ({ fatal: e.message }));

  log(JSON.stringify(r, null, 1));
  await b.close();
})();
