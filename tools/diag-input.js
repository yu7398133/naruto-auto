// 单独验证 Input.dispatchMouseEvent 是否会在本标签页上 hang
const http = require('http');
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => s(JSON.parse(d)));
}).on('error', j));

(async () => {
  const tabs = await getJ('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('arm-game'));
  console.log('标签页:', tab.url.slice(0, 55));
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', e => {
    const j = JSON.parse(e.data);
    if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); }
  });
  await new Promise(r => ws.addEventListener('open', r));

  const withTimeout = (p, ms, what) => Promise.race([
    p, new Promise((_, rej) => setTimeout(() => rej(new Error('超时: ' + what)), ms)),
  ]);

  const t = async (label, method, params) => {
    try {
      const r = await withTimeout(send(method, params), 4000, label);
      console.log(`  ✅ ${label} →`, JSON.stringify(r.result || r.error).slice(0, 90));
    } catch (e) { console.log(`  ❌ ${label} → ${e.message}`); }
  };

  // 用不带 sessionId 的根连接试
  console.log('\n[根连接] 不 enable 任何域');
  await t('Runtime.evaluate', 'Runtime.evaluate', { expression: '1+1', returnByValue: true });
  await t('Input.dispatchMouseEvent(moved)', 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: 500, y: 300, button: 'none' });

  console.log('\n[根连接] 先 Input.enable');
  await t('Input.enable', 'Input.enable', {});
  await t('Input.dispatchMouseEvent(moved)', 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: 500, y: 300, button: 'none' });
  await t('Input.dispatchMouseEvent(pressed)', 'Input.dispatchMouseEvent', { type: 'mousePressed', x: 500, y: 300, button: 'left', clickCount: 1 });
  await t('Input.dispatchMouseEvent(released)', 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: 500, y: 300, button: 'left', clickCount: 1 });

  console.log('\n[根连接] Page.bringToFront 后再试');
  await t('Page.bringToFront', 'Page.bringToFront', {});
  await t('Input.dispatchMouseEvent(moved)', 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: 500, y: 300, button: 'none' });

  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
