// 点击安装页的「重新安装」按钮
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});

function cdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0; const pend = new Map();
    const send = (m, p) => new Promise(r => {
      const i = ++id; pend.set(i, r);
      ws.send(JSON.stringify({ id: i, method: m, params: p }));
    });
    ws.addEventListener('message', ev => {
      const j = JSON.parse(ev.data);
      if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); }
    });
    ws.addEventListener('open', () => resolve({ ws, send }));
    ws.addEventListener('error', reject);
  });
}

(async () => {
  const tabs = await getJSON('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('ask.html'));
  if (!tab) { console.log('未找到安装确认页'); process.exit(1); }
  console.log('目标页:', tab.title);

  const { ws, send } = await cdp(tab.webSocketDebuggerUrl);
  await send('Runtime.enable', {});
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
    if (r?.result?.exceptionDetails) return { __exc: String(r.result.exceptionDetails.text).slice(0,300) };
    return r?.result?.result?.value;
  };

  console.log('\n=== 点击「重新安装」 ===');
  console.log(await ev(`(() => {
    const btns = Array.from(document.querySelectorAll('input.button, button'));
    const target = btns.find(b => /重新安装|安装/.test((b.value || b.innerText || '')));
    if (!target) return 'button not found: ' + btns.map(b=>b.value||b.innerText).join('/');
    target.click();
    return 'clicked: ' + (target.value || target.innerText) + ' id=' + target.id;
  })()`));

  await sleep(4000);
  console.log('\n点击后 URL:', await ev('location.href'));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
