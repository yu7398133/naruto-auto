// 探查左上角菜单：DOM 结构、开关方式、点击后的副作用
(async () => {
  const http = require('http');
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
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

    // 找左上角区域(0..300, 0..300)里所有可点元素
    out.hits = [];
    for (let y = 8; y <= 260; y += 12) {
      for (let x = 8; x <= 260; x += 12) {
        const el = document.elementFromPoint(x, y);
        if (!el) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        out.hits.push({ x, y, tag: el.tagName, cls: String(el.className).slice(0,55),
          id: el.id, cur: cs.cursor, w: Math.round(r.width), h: Math.round(r.height) });
      }
    }
    // 去重（同类只留一个）
    const seen = new Set(); const uniq = [];
    for (const h of out.hits) { const k = h.tag+'|'+h.cls+'|'+h.id; if (!seen.has(k)) { seen.add(k); uniq.push(h); } }
    out.hits = uniq;

    // 常见菜单选择器
    const sels = ['.setting-list','.menu','.sidebar','.header','.toolbar','header',
                  '[class*=menu]','[class*=setting]','[class*=side]','[class*=tool]',
                  '[class*=header]','[class*=top]','[class*=nav]'];
    out.bySel = {};
    for (const s of sels) {
      try {
        const n = document.querySelectorAll(s);
        if (n.length) out.bySel[s] = [...n].slice(0,4).map(e => ({
          tag: e.tagName, cls: String(e.className).slice(0,60), id: e.id,
          r: (() => { const b = e.getBoundingClientRect();
            return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; })(),
          txt: (e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,60)
        }));
      } catch(e) {}
    }

    // 已知的 setting-list（之前查到过，在左侧 x<0 展开）
    const sl = document.querySelector('.setting-list');
    out.settingList = sl ? {
      visible: sl.getBoundingClientRect().width > 0,
      rect: (() => { const b = sl.getBoundingClientRect();
        return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; })(),
      parentCls: sl.parentElement ? String(sl.parentElement.className).slice(0,60) : '',
      siblingCls: [...(sl.parentElement ? sl.parentElement.children : [])].map(e => String(e.className).slice(0,40))
    } : null;
    return JSON.stringify(out, null, 1);
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(r?.result?.result?.value || JSON.stringify(r).slice(0, 3000));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
