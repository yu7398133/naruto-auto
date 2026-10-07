// 点击「已安装脚本」导航，进真正的脚本列表
const http = require('http');
const TM_ID = 'gcalenpjmijncebpfijmoaglllgpjagf';
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
  const tm = tabs.find(t => t.url.includes(TM_ID) && t.type === 'page');
  const { ws, send } = await cdp(tm.webSocketDebuggerUrl);
  await send('Runtime.enable', {});
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r?.result?.exceptionDetails) return 'EXC: ' + r.result.exceptionDetails.text;
    return r?.result?.result?.value;
  };

  // 找并点击「已安装脚本」链接
  console.log('点击已安装脚本...');
  console.log(await ev(`(() => {
    const as = Array.from(document.querySelectorAll('a, button, li, div'));
    const t = as.find(e => (e.innerText||'').trim() === '已安装脚本');
    if (t) { t.click(); return 'clicked: ' + t.tagName + ' ' + t.className; }
    return 'not-found; candidates=' + as.filter(e=>/脚本/.test(e.innerText||'')).slice(0,5).map(e=>e.tagName+':'+(e.innerText||'').trim().slice(0,20)).join(' | ');
  })()`));

  await sleep(3000);

  console.log('\nURL:', await ev('location.href'));
  console.log('\n=== 列表页正文 ===');
  console.log(await ev(`document.body.innerText.slice(0, 2000)`));

  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
