// 抓 share-wrap 的完整 DOM + 所有可能的关闭按钮
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
    const w = document.querySelector('.share-wrap');
    if (!w) return JSON.stringify({ found: false });
    const out = { found: true, html: w.outerHTML.slice(0, 3000) };

    // 递归列出所有有尺寸的元素
    const dump = (el, d) => {
      if (d > 5) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const o = { tag: el.tagName, cls: String(el.className).slice(0,60),
        x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2),
        w: Math.round(r.width), h: Math.round(r.height),
        disp: cs.display, cursor: cs.cursor,
        txt: (el.innerText||'').replace(/\\s+/g,' ').trim().slice(0,45) };
      const k = [...el.children].map(c => dump(c, d+1)).filter(Boolean);
      if (k.length) o.kids = k;
      return o;
    };
    out.tree = dump(w, 0);

    // 弹窗外层也看看（可能是 portal 结构）
    out.parentChain = [];
    let p = w.parentElement;
    for (let i = 0; i < 4 && p; i++) {
      out.parentChain.push({ tag: p.tagName, cls: String(p.className).slice(0,60), id: p.id });
      p = p.parentElement;
    }
    return JSON.stringify(out, null, 1);
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(r?.result?.result?.value || JSON.stringify(r).slice(0, 3000));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
