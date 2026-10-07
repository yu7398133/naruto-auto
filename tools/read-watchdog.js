// 读取 TM 里 #14「火影后台保活看门狗」的源码
(async () => {
  const http = require('http');
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const getJSON = (p) => new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
  const tabs = await getJSON('/json/list');
  const tm = tabs.find(t => t.url.includes('dashboard') || t.url.includes('gcalenpjmijncebpfijmoaglllgpjagf'));
  if (!tm) { console.log('没找到 TM 页面。当前 tabs:'); tabs.forEach(t => console.log('  ', t.type, t.url.slice(0,90))); process.exit(0); }
  const ws = new WebSocket(tm.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', ev => { const j = JSON.parse(ev.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});
  const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.result.value;

  // 打开 TM 编辑器页
  await send('Page.enable', {});
  await send('Page.navigate', { url: 'chrome-extension://gcalenpjmijncebpfijmoaglllgpjagf/options.html#nav=utils' });
  await sleep(2500);

  console.log(await ev(`document.title + ' | ' + location.hash`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
