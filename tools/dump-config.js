// 把页面里备份的配置导出到本地文件
const http = require('http');
const fs = require('fs');

const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});

(async () => {
  const tabs = await getJSON('/json/list');
  const t = tabs.find(x => x.type === 'page' && x.url.includes('start.qq.com'));
  if (!t) { console.log('no game tab'); process.exit(1); }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
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

  const r = await send('Runtime.evaluate', {
    expression: 'window.__na_config_backup__ || "NONE"',
    returnByValue: true
  });
  const v = r?.result?.result?.value || 'NONE';
  fs.writeFileSync('backups/config-before-reinstall.json', v, 'utf8');
  console.log('已导出:', v.length, '字节');
  console.log('内容预览:', v.slice(0, 400));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
