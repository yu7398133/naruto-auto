// 诊断：ask.html 上到底有哪些元素？为什么找不到「安装」按钮？
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const get = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
const put = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p, method: 'PUT' }, r => { r.resume(); r.on('end', res); }).on('error', rej);
});
function conn(u) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(u); let id = 0; const pend = new Map();
    ws.addEventListener('message', e => { const j = JSON.parse(e.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
    ws.addEventListener('open', () => resolve({ ws, send: (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); }) }));
    ws.addEventListener('error', reject);
  });
}
(async () => {
  const l = await get('/json/list');
  const asks = l.filter(t => t.url.includes('ask.html'));
  console.log('ask.html 数量: ' + asks.length);
  if (!asks.length) {
    console.log('--- 当前所有页面 ---');
    l.filter(t => t.type === 'page').forEach(t => console.log('  [' + t.title + '] ' + t.url.slice(0, 100)));
    return;
  }
  const t = asks[asks.length - 1];
  console.log('目标: ' + t.url.slice(0, 90));
  await put('/json/activate/' + t.id);
  await sleep(800);
  const { ws, send } = await conn(t.webSocketDebuggerUrl);
  const r = await send('Runtime.evaluate', {
    expression: `(() => {
      const all = [...document.querySelectorAll('*')];
      const inputs = [...document.querySelectorAll('input,button,a')].map(x => ({
        tag: x.tagName, type: x.type || '', id: x.id || '',
        val: (x.value || '').slice(0, 40), txt: (x.innerText || '').slice(0, 40),
        vis: !!(x.offsetWidth || x.offsetHeight)
      }));
      return JSON.stringify({ ready: document.readyState, url: location.href.slice(0, 80), n: all.length, inputs }, null, 1);
    })()`, returnByValue: true
  });
  console.log(r.result.result.value);
  ws.close();
})();
