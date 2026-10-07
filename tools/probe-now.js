// 确认弹窗现状 + 能否读到样式表 + 当前页面状态
(async () => {
  const http = require('http');
  const getJSON = (p) => new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
  const tabs = await getJSON('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('arm-game'));
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', ev => { const j = JSON.parse(ev.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});

  const expr = `(function(){
    const out = {};
    out.now = new Date().toLocaleTimeString();
    out.hasPopup = !!document.querySelector('.message-wrap');
    out.videoCount = document.querySelectorAll('video').length;
    const v = document.querySelector('video');
    out.video = v ? { rs: v.readyState, paused: v.paused } : null;
    out.sheets = [...document.styleSheets].map(s => {
      let n = -1, err = null;
      try { n = s.cssRules ? s.cssRules.length : -1; } catch(e) { err = e.name; }
      return { href: s.href ? s.href.slice(-50) : '(inline)', rules: n, err };
    });
    // 找页面上的「剩余时长」元素（续期相关）
    const rt = [...document.querySelectorAll('*')].filter(e =>
      e.children.length === 0 && /剩余时长|体验时长|时长不足/.test(e.textContent||''));
    out.timeEls = rt.slice(0,5).map(e => {
      const r = e.getBoundingClientRect();
      return { cls: String(e.className).slice(0,50), txt: e.textContent.trim().slice(0,40),
               x: Math.round(r.x), y: Math.round(r.y), vis: getComputedStyle(e).visibility };
    });
    return JSON.stringify(out, null, 1);
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(r?.result?.result?.value || JSON.stringify(r).slice(0, 2000));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
