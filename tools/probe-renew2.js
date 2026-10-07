// 找「续时/延长体验」弹窗本身 + 剩余时长变化规律
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
    const out = {};
    // 所有可见的弹窗/遮罩容器
    const dlg = [];
    document.querySelectorAll('div,section,article').forEach(el => {
      const c = String(el.className||'');
      if (!/dialog|modal|popup|mask|overlay|tips|toast|confirm|alert|renew|extend|left-time/i.test(c)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 20 || r.height < 20) return;
      const t = (el.innerText||'').replace(/\\s+/g,' ').trim().slice(0,150);
      dlg.push({ cls:c.slice(0,70), x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height), vis: getComputedStyle(el).display!=='none', text:t });
    });
    out.dialogs = dlg.slice(0,40);
    // 所有 button
    out.buttons = [...document.querySelectorAll('button,a[role=button],[class*=btn]')]
      .map(el => { const r = el.getBoundingClientRect();
        return { t:(el.innerText||'').trim().slice(0,30), cls:String(el.className).slice(0,50),
                 x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2), w:Math.round(r.width), h:Math.round(r.height) }; })
      .filter(b => b.w>0 && b.h>0 && b.t).slice(0,40);
    return JSON.stringify(out, null, 1);
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(r?.result?.result?.value || JSON.stringify(r).slice(0,2000));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
