// 精确抓 message-wrap 弹窗的 DOM 结构与按钮
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
    const w = document.querySelector('.message-wrap');
    if (!w) return JSON.stringify({found:false, note:'没有 .message-wrap'});
    const dump = (el, depth) => {
      if (depth > 4) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const o = {
        tag: el.tagName, cls: String(el.className).slice(0,70), id: el.id,
        x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2),
        w: Math.round(r.width), h: Math.round(r.height),
        z: cs.zIndex, disp: cs.display, vis: cs.visibility,
        txt: (el.innerText||'').replace(/\\s+/g,' ').trim().slice(0,60)
      };
      const kids = [...el.children].map(c => dump(c, depth+1)).filter(Boolean);
      if (kids.length) o.kids = kids;
      return o;
    };
    const out = { found: true, html: w.outerHTML.slice(0, 2000), tree: dump(w, 0) };

    // 弹窗内所有可点元素
    const btns = [];
    w.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const t = (el.innerText||'').trim();
      const cls = String(el.className);
      if (!t && !/btn|button|close|cancel|confirm/i.test(cls)) return;
      btns.push({ tag: el.tagName, cls: cls.slice(0,60), txt: t.slice(0,30),
                  x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2),
                  w: Math.round(r.width), h: Math.round(r.height), cursor: cs.cursor });
    });
    out.buttons = btns;
    return JSON.stringify(out, null, 1);
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(r?.result?.result?.value || JSON.stringify(r).slice(0, 2500));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
