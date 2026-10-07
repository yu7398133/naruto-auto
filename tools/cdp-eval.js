// 通用 CDP 执行器：node tools/cdp-eval.js "<file-with-js>"
const http = require('http');
const fs = require('fs');

const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});

(async () => {
  const jsFile = process.argv[2];
  if (!jsFile) { console.log('用法: node tools/cdp-eval.js <js文件> [url匹配]'); process.exit(1); }
  const match = process.argv[3] || 'start.qq.com';
  const expr = fs.readFileSync(jsFile, 'utf8');

  const tabs = await getJSON('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes(match));
  if (!tab) { console.log('未找到匹配标签:', match); process.exit(1); }

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

  const r = await send('Runtime.evaluate', {
    expression: expr, returnByValue: true, awaitPromise: true, userGesture: true
  });
  if (r?.result?.exceptionDetails) {
    console.log('EXCEPTION:', JSON.stringify(r.result.exceptionDetails, null, 1).slice(0, 1500));
  } else {
    const v = r?.result?.result?.value;
    console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 1));
  }
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
