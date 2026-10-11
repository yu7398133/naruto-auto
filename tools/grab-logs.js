// 读脚本面板日志缓冲里所有与「商店/定位」相关的行
const http = require('http');
function get(p) { return new Promise((res, rej) => { http.get({ host: '127.0.0.1', port: 9222, path: p }, r => { let d = ''; r.setEncoding('utf8'); r.on('data', c => d += c); r.on('end', () => res(d)); }).on('error', rej); }); }
(async () => {
  const list = JSON.parse(await get('/json/list'));
  const page = list.find(t => t.type === 'page' && /start\.qq\.com/.test(t.url));
  const sock = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  sock.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (m, p) => new Promise(res => { const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await new Promise(r => sock.addEventListener('open', r));

  const r = await send('Runtime.evaluate', { expression: `(() => {
    const p = window.__narutoAuto && window.__narutoAuto.panel;
    if (!p || !p.logs) return 'NO_LOGS';
    const all = p.logs.map(l => (l.t || l.time || '') + ' [' + (l.level||l.lv||'') + '] ' + (l.msg||l.message||l.text||JSON.stringify(l)));
    const hit = all.filter(s => /商店|特权|定位|score|跳过本任务/.test(s));
    return JSON.stringify({ total: all.length, hit: hit.slice(-40) }, null, 1);
  })()`, returnByValue: true });
  console.log(r.result.result.value);
  sock.close();
})().catch(e => console.log('ERR ' + e.message));
