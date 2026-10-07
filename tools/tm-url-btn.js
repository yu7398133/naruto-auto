// 找到 URL 输入框旁边的确认按钮并真实点击
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});

(async () => {
  const tabs = await getJSON('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('options.html'));
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => {
    const i = ++id; pend.set(i, r);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
  ws.addEventListener('message', ev => {
    const j = JSON.parse(ev.data);
    if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); }
  });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});

  // 找触发器按钮（和 url 输入框同区域）
  const r = await send('Runtime.evaluate', {
    expression: `(() => {
      const inp = document.querySelector('#input_dXRpbHNfdXRpbHNfdXJs');
      if (!inp) return JSON.stringify({err:'no input'});
      // 向上找容器，再找同容器内的可点元素
      let box = inp;
      for (let i = 0; i < 5 && box.parentElement; i++) box = box.parentElement;
      const cand = Array.from(box.querySelectorAll('input[type=button], button, a, span, div'))
        .filter(e => e !== inp && e.offsetParent)
        .map(e => ({ tag: e.tagName, id: e.id, cls: (e.className||'').toString().slice(0,40),
                     txt: (e.innerText||e.value||'').trim().slice(0,25),
                     rect: (()=>{const b=e.getBoundingClientRect();return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)};})() }))
        .filter(e => e.txt || /button|install|ok/i.test(e.cls));
      return JSON.stringify({ inputVal: inp.value, candidates: cand.slice(0, 15) }, null, 1);
    })()`,
    returnByValue: true
  });
  console.log(r.result.result.value);
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
