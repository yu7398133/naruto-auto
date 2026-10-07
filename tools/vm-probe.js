// 连接 Violentmonkey 的 SW，检查可用的脚本管理接口
const http = require('http');
const VM_ID = 'gcalenpjmijncebpfijmoaglllgpjagf';

const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});

const PROBE = `(() => {
  const o = {};
  o.keys = Object.keys(self).filter(k => /script|vm|store|update|inject/i.test(k)).slice(0,40);
  o.hasVM = typeof self.VM !== 'undefined';
  if (self.VM) o.vmKeys = Object.keys(self.VM).slice(0,40);
  o.chrome = typeof chrome !== 'undefined';
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    o.runtimeId = chrome.runtime.id;
    o.hasGetURL = typeof chrome.runtime.getURL === 'function';
  }
  return JSON.stringify(o);
})()`;

(async () => {
  const tabs = await getJSON('/json/list');
  const sw = tabs.find(t => t.url.includes(VM_ID) && t.type === 'service_worker');
  console.log('SW url:', sw.url);

  const ws = new WebSocket(sw.webSocketDebuggerUrl);
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
  const r = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
  const v = r?.result?.result?.value;
  console.log(v ? JSON.stringify(JSON.parse(v), null, 2) : JSON.stringify(r, null, 2));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
