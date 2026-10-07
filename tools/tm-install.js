// 打开 user.js 安装页，定位并点击「安装/更新」按钮
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
  const TARGET = 'http://127.0.0.1:8899/naruto-auto.user.js';

  // 打开安装页
  const u = `http://127.0.0.1:9222/json/new?${encodeURIComponent(TARGET)}`;
  await new Promise((res, rej) => http.get(u, { method: 'PUT' }, r => { r.resume(); r.on('end', res); }).on('error', rej));
  await sleep(4000);

  const tabs = await getJSON('/json/list');
  console.log('=== 当前页面 ===');
  tabs.filter(t => t.type === 'page').forEach(t => console.log(`[${t.title}]\n   ${t.url.slice(0,120)}`));

  // 找安装页
  const installTab = tabs.find(t => t.type === 'page' && (
    t.url.includes('script_installation') || t.url.includes('ask.html') || t.url.includes('tampermonkey.net')
  ));
  if (!installTab) { console.log('\n未找到安装页 —— 可能直接重定向了'); process.exit(0); }

  console.log('\n=== 安装页内容 ===');
  const { ws, send } = await cdp(installTab.webSocketDebuggerUrl);
  await send('Runtime.enable', {});
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r?.result?.exceptionDetails) return { __exc: String(r.result.exceptionDetails.text).slice(0,300) };
    return r?.result?.result?.value;
  };

  await sleep(1500);
  console.log(await ev(`JSON.stringify({
    url: location.href,
    title: document.title,
    text: document.body.innerText.slice(0, 900),
    buttons: Array.from(document.querySelectorAll('button,input[type=button],input[type=submit],a')).map(b => ({
      tag: b.tagName, id: b.id, cls: (b.className||'').toString().slice(0,40),
      text: (b.innerText||b.value||'').trim().slice(0,30)
    })).filter(b => b.text).slice(0, 25)
  }, null, 1)`));

  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
