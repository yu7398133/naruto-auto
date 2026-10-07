// 原子操作：定位 URL 输入框 -> 填入 -> 找到确认按钮 -> 真实点击
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const URL_TO_INSTALL = 'http://127.0.0.1:8899/naruto-auto.user.js';

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

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r?.result?.exceptionDetails) return 'EXC: ' + String(r.result.exceptionDetails.text).slice(0,250);
    return r?.result?.result?.value;
  };

  // 确保在 utils 页
  await ev(`location.hash = '#nav=utils'; 'ok'`);
  await sleep(2500);

  // 列出所有输入框 + 附近按钮
  const info = await ev(`(() => {
    const out = { inputs: [], buttons: [] };
    document.querySelectorAll('input').forEach(i => {
      if (i.offsetParent) out.inputs.push({ id: i.id, type: i.type, ph: i.placeholder, val: i.value });
    });
    document.querySelectorAll('input[type=button], button').forEach(b => {
      if (b.offsetParent) {
        const r = b.getBoundingClientRect();
        out.buttons.push({ id: b.id, val: b.value || b.innerText, x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) });
      }
    });
    return JSON.stringify(out, null, 1);
  })()`);
  console.log('=== 控件清单 ===');
  console.log(info);

  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
