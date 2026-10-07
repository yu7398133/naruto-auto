// 找当前页面上所有可见的弹窗/遮罩（含平台外层的分享弹窗）
(async () => {
  const http = require('http');
  const getJSON = (p) => new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
  const tabs = await getJSON('/json/list');
  console.log('=== 标签页 ===');
  tabs.filter(t => t.type === 'page').forEach(t => console.log(' -', t.title.slice(0,40), '|', t.url.slice(0,75)));

  for (const tab of tabs.filter(t => t.type === 'page' && (t.url.includes('arm-game') || t.url.includes('start.qq.com')))) {
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    let id = 0; const pend = new Map();
    const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
    ws.addEventListener('message', ev => { const j = JSON.parse(ev.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
    await new Promise(r => ws.addEventListener('open', r));
    await send('Runtime.enable', {});
    const expr = `(function(){
      const out = { url: location.href.slice(0,90), popups: [] };
      document.querySelectorAll('body *').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width < 120 || r.height < 100) return;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return;
        const z = parseInt(cs.zIndex) || 0;
        if (!(cs.position === 'fixed' || cs.position === 'absolute') || z < 10) return;
        const txt = (el.innerText || '').replace(/\\s+/g, ' ').trim();
        if (!txt) return;
        out.popups.push({ tag: el.tagName, cls: String(el.className).slice(0,70), id: el.id, z,
          x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
          txt: txt.slice(0, 180) });
      });
      out.popups.sort((a,b) => (b.w*b.h)-(a.w*a.h));
      out.popups = out.popups.slice(0, 12);
      return JSON.stringify(out, null, 1);
    })()`;
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    console.log('\n### ' + tab.url.slice(0,60));
    console.log(r?.result?.result?.value || JSON.stringify(r).slice(0, 1500));
    ws.close();
  }
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
