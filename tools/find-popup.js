// 抓当前页面上所有可见的弹窗/遮罩层 —— 找出盖住画面的那个
(async () => {
  const http = require('http');
  const getJSON = (p) => new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
  const tabs = await getJSON('/json/list');
  console.log('=== 所有标签页 ===');
  tabs.filter(t => t.type === 'page').forEach(t => console.log(' -', t.title.slice(0,50), '|', t.url.slice(0,80)));

  const tab = tabs.find(t => t.type === 'page' && (t.url.includes('arm-game') || t.url.includes('start.qq.com')));
  if (!tab) { console.log('未找到游戏页'); process.exit(1); }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', ev => { const j = JSON.parse(ev.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});

  const expr = `(function(){
    const out = { url: location.href.slice(0,120) };
    const v = document.querySelector('video');
    out.video = v ? { readyState: v.readyState, paused: v.paused, rs: v.readyState, t: Math.round(v.currentTime) } : null;

    // 找覆盖在 video 之上的、面积较大的可见元素（z-index 或 fixed 定位）
    const cands = [];
    document.querySelectorAll('body *').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width < 100 || r.height < 80) return;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return;
      const z = parseInt(cs.zIndex) || 0;
      const fixed = cs.position === 'fixed' || cs.position === 'absolute';
      if (!fixed || z < 1) return;
      const txt = (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 200);
      cands.push({ tag: el.tagName, cls: String(el.className).slice(0,80), id: el.id,
                   z, pos: cs.position, x: Math.round(r.x), y: Math.round(r.y),
                   w: Math.round(r.width), h: Math.round(r.height),
                   bg: cs.backgroundColor, txt });
    });
    // 面积大的排前面
    cands.sort((a,b) => (b.w*b.h) - (a.w*a.h));
    out.overlays = cands.slice(0, 25);
    return JSON.stringify(out, null, 1);
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(r?.result?.result?.value || JSON.stringify(r).slice(0, 2000));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
