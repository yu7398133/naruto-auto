// 在真实页面里调用 v0.6.73 血条判据，确认：
//   ① 方法存在且不抛异常（getImageData 跨域/尺寸越界都会在这里暴露）
//   ② 返回结构完整
//   ③ 当前画面（应在主界面或准备页）读数为「非战斗」
// 用法: node tools/probe-hpbar-live.js
const http = require('http');

function cdpJson(path) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9222, path }, r => {
      let b = ''; r.on('data', d => b += d); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { res(b); } });
    }).on('error', rej);
  });
}
function cdpActivate(id) {
  return new Promise((res) => {
    http.get({ host: '127.0.0.1', port: 9222, path: `/json/activate/${id}` }, r => {
      let b = ''; r.on('data', d => b += d); r.on('end', () => res(b));
    }).on('error', () => res(null));
  });
}

(async () => {
  const list = await cdpJson('/json/list');
  const page = list.find(t => t.type === 'page' && /start\.qq\.com/.test(t.url));
  if (!page) { console.log('找不到游戏标签页'); process.exit(1); }
  await cdpActivate(page.id);   // 后台标签页 Input 被吞，且激活后才保证画面在渲染
  await new Promise(r => setTimeout(r, 400));

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let msgId = 0;
  const pending = new Map();
  const send = (method, params) => new Promise(res => {
    const id = ++msgId; pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  await new Promise(r => ws.onopen = r);

  const expr = `(() => {
    const A = window.__narutoAuto;
    if (!A) return { err: 'no __narutoAuto' };
    const v = A.vision;
    const out = { hasBothRed: typeof v.hpBarBothRed === 'function',
                  hasLatched: typeof v.hpBarCombatLatched === 'function',
                  hasReset: typeof v.hpBarResetLatch === 'function' };
    if (!out.hasBothRed) return out;
    try { out.both = v.hpBarBothRed(); } catch (e) { out.bothErr = String(e && e.message); }
    try { out.latched = v.hpBarCombatLatched(); } catch (e) { out.latchedErr = String(e && e.message); }
    try { out.scene = A.scenes.detect(false).scene; } catch (e) { out.sceneErr = String(e && e.message); }
    return out;
  })()`;

  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  const val = r.result && r.result.result && r.result.result.value;
  console.log(JSON.stringify(val, null, 2));
  ws.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
