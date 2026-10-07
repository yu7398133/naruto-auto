// 打开 TM dashboard 并读取火影脚本版本
const http = require('http');
const TM = 'gcalenpjmijncebpfijmoaglllgpjagf';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});

(async () => {
  const u = `http://127.0.0.1:9222/json/new?${encodeURIComponent('chrome-extension://' + TM + '/options.html#nav=dashboard')}`;
  await new Promise((res, rej) => http.get(u, { method: 'PUT' }, r => { r.resume(); r.on('end', res); }).on('error', rej));
  await sleep(6000);

  const tabs = await getJSON('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('options.html'));
  if (!tab) { console.log('未打开 options 页'); process.exit(1); }

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', ev => { const j = JSON.parse(ev.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});

  await sleep(2500);
  const r = await send('Runtime.evaluate', {
    expression: `Array.from(document.querySelectorAll('tr')).map(t=>(t.innerText||'').replace(/\\s+/g,' ').trim()).filter(s=>/火影/.test(s)).join('\\n')`,
    returnByValue: true
  });
  console.log('=== 火影相关脚本 ===');
  console.log(r?.result?.result?.value || '(无)');
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
