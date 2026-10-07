// 校验页面已加载 v0.6.44 且新 API 可用
(async () => {
  const http = require('http');
  const getJSON = (p) => new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
  const tabs = await getJSON('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('arm-game'));
  if (!tab) { console.log('未找到游戏页'); process.exit(1); }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', ev => { const j = JSON.parse(ev.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});

  const expr = `(function(){
    const A = window.__narutoAuto;
    if (!A) return JSON.stringify({loaded:false, note:'__narutoAuto 不存在（页面未刷新）'});
    const app = A.app;
    const v = A.vision && A.vision.video;
    return JSON.stringify({
      loaded: true,
      version: (app && app.VERSION) || '?',
      hasIsStreamAlive: !!(app && typeof app.isStreamAlive === 'function'),
      hasTryRevive: !!(app && typeof app._tryReviveStream === 'function'),
      streamAliveNow: (app && typeof app.isStreamAlive === 'function') ? app.isStreamAlive() : null,
      streamAliveApi: typeof A.streamAlive === 'function' ? A.streamAlive() : 'n/a',
      video: v ? { readyState: v.readyState, paused: v.paused, w: v.videoWidth, h: v.videoHeight } : null,
      pollMin: A.config && A.config.get ? 'n/a' : null
    });
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(r?.result?.result?.value || JSON.stringify(r).slice(0, 1500));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
