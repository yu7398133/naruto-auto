// 实时验证追踪器的 decide/phase/note 三种新步骤能否正常写入与渲染。
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
    if (!A) return { err: 'no __narutoAuto' };
    const t = A.app && A.app.trace;
    if (!t) return { err: 'no app.trace' };
    const before = t.steps ? t.steps.length : -1;
    const hadOn = !!t.on;

    // 强制打开追踪（不影响游戏，只记录）
    t.on = true;
    if (!t.startedAt) t.startedAt = Date.now();

    // 依次调用三种新 API
    t.setPhase('测试/阶段A');
    t.note('这是一条 note 测试');
    t.decide('testProbe', { score: 27.4, thresh: 55, verdict: 'hit', at: [128, 668], extra: { ok: true } });
    t.setPhase('测试/阶段B');

    const after = t.steps ? t.steps.length : -1;
    const tail = (t.steps || []).slice(-6).map(s => ({
      seq: s.seq, kind: s.kind, label: (s.label || '').slice(0, 40),
      hasDecide: !!s.decide, decide: s.decide || null,
      phase: s.phase || null, hasFrame: !!s.frame,
    }));

    return { before, after, added: after - before, hadOn, tail, version: A.VERSION || null };
  }));

  log('结果:', JSON.stringify(r, null, 1).slice(0, 1800));

  // 验证 viewer 能否生成（不下载，只看能否构建 HTML）
  const v = await ok(g.evaluate(() => {
    const A = window.__narutoAuto;
    try {
      const html = A.app.trace._viewerHtml(A.app.trace.steps, A.VERSION || '0');
      return { len: html.length, hasDecidePanel: /判定详情/.test(html), hasPhase: /kind-phase/.test(html) };
    } catch (e) { return { err: e.message }; }
  }));
  log('viewer:', JSON.stringify(v));

  await ok(browser.close());
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
