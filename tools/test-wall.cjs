// 实测 v0.5.96：wall 字段是否写入 + viewer 是否渲染。
const { chromium } = require('playwright');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const ok = async (p) => { try { return await p; } catch (e) { return '__ERR__' + e.message; } };

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const g = ctx.pages().find(p => /start\.qq\.com\/game/.test(p.url()));
  if (!g) { log('✗ 没找到游戏页'); await ok(browser.close()); return; }

  const r = await ok(g.evaluate(() => {
    const A = window.__narutoAuto;
    const t = A && A.app && A.app.trace;
    if (!t) return { err: 'no trace' };
    const before = t.steps ? t.steps.length : -1;
    t.on = true; if (!t.startedAt) t.startedAt = Date.now();
    t.setPhase('测试/墙钟A');
    t.note('note 带墙钟');
    t.decide('wbProbe', { score: 41, thresh: 55, verdict: 'hit', at: [128, 669] });
    const tail = (t.steps || []).slice(-4).map(s => ({
      seq: s.seq, kind: s.kind, wall: s.wall || null, t: s.t,
      label: (s.label || '').slice(0, 30),
    }));
    // 单独测 wallClock 格式
    const wc = t.wallClock ? t.wallClock(new Date(2026, 8, 21, 12, 23, 14, 567)) : 'no-method';
    return { added: (t.steps || []).length - before, tail, wc };
  }));
  log('结果:', JSON.stringify(r, null, 1));

  const v = await ok(g.evaluate(() => {
    const A = window.__narutoAuto;
    try {
      const html = A.app.trace._viewerHtml(A.app.trace.steps, A.VERSION || '0');
      return {
        len: html.length,
        hasWallFn: /function wc\(s\)/.test(html),
        hasT2: /class=t2/.test(html),
        sampleWall: (html.match(/"wall":"[^"]*"/) || ['无'])[0],
      };
    } catch (e) { return { err: e.message }; }
  }));
  log('viewer:', JSON.stringify(v));

  await ok(browser.close());
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
