// 关掉安装残留标签，然后 F5 游戏页并验证 v0.6.45 的新 API
(async () => {
  const http = require('http');
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const getJSON = (p) => new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
  const closeTab = (id) => new Promise(r => http.get({ host: '127.0.0.1', port: 9222, path: '/json/close/' + id }, x => { x.resume(); x.on('end', r); }).on('error', r));

  // 1) 关掉安装残留
  let tabs = await getJSON('/json/list');
  for (const t of tabs) {
    if (/ask\.html|script_installation\.php|options\.html/.test(t.url)) {
      await closeTab(t.id); console.log('关闭:', t.url.slice(0, 60));
    }
  }
  await sleep(800);

  // 2) reload 游戏页
  tabs = await getJSON('/json/list');
  const game = tabs.find(t => t.type === 'page' && t.url.includes('arm-game'));
  if (!game) { console.log('未找到游戏页'); process.exit(1); }
  const ws = new WebSocket(game.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', ev => { const j = JSON.parse(ev.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Page.enable', {});
  await send('Page.reload', { ignoreCache: true });
  console.log('已 F5 游戏页，等待加载…');
  ws.close();

  await sleep(12000);

  // 3) 验证新 API
  tabs = await getJSON('/json/list');
  const g2 = tabs.find(t => t.type === 'page' && t.url.includes('arm-game'));
  const ws2 = new WebSocket(g2.webSocketDebuggerUrl);
  let id2 = 0; const pend2 = new Map();
  const send2 = (m, p) => new Promise(r => { const i = ++id2; pend2.set(i, r); ws2.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws2.addEventListener('message', ev => { const j = JSON.parse(ev.data); if (j.id && pend2.has(j.id)) { pend2.get(j.id)(j); pend2.delete(j.id); } });
  await new Promise(r => ws2.addEventListener('open', r));
  await send2('Runtime.enable', {});
  const expr = `(function(){
    const A = window.__narutoAuto;
    if (!A) return JSON.stringify({loaded:false, note:'尚未注入(可能还在加载)'});
    const app = A.app;
    const v = A.vision && A.vision.video;
    return JSON.stringify({
      loaded: true,
      version: (app && app.VERSION) || '?',
      hasReadPopup: !!(A.vision && typeof A.vision.readPopup === 'function'),
      hasPopupApi: typeof A.popup === 'function',
      popupNow: (A.vision && A.vision.readPopup) ? A.vision.readPopup() : 'n/a',
      hasIsStreamAlive: !!(app && typeof app.isStreamAlive === 'function'),
      streamAlive: (app && typeof app.isStreamAlive === 'function') ? app.isStreamAlive() : null,
      video: v ? { rs: v.readyState, paused: v.paused, w: v.videoWidth } : null,
      panel: !!document.querySelector('#na-panel')
    });
  })()`;
  const r = await send2('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(r?.result?.result?.value || JSON.stringify(r).slice(0, 1200));
  ws2.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
