// 抓页面日志里「商店 定位」的实际 score，并当场对当前画面重跑一次匹配
const http = require('http');
function get(p) { return new Promise((res, rej) => { http.get({ host: '127.0.0.1', port: 9222, path: p }, r => { let d = ''; r.setEncoding('utf8'); r.on('data', c => d += c); r.on('end', () => res(d)); }).on('error', rej); }); }
(async () => {
  const list = JSON.parse(await get('/json/list'));
  const page = list.find(t => t.type === 'page' && /start\.qq\.com/.test(t.url));
  if (!page) { console.log('NO_TAB'); return; }
  const sock = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  sock.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (m, p) => new Promise(res => { const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await new Promise(r => sock.addEventListener('open', r));

  // 1) 从脚本运行态里捞日志（面板的日志数组）
  const r = await send('Runtime.evaluate', { expression: `(() => {
    const api = window.__narutoAuto;
    const out = { ver: window.__narutoAutoOwnerVer };
    try {
      const logs = [];
      // 面板日志缓冲区常见挂点
      ['panel','app'].forEach(k => { const o = api && api[k]; if (o) out['keys_'+k] = Object.keys(o).slice(0,25); });
      if (api && api.streamAlive) out.streamAlive = api.streamAlive();
    } catch (e) { out.err = e.message; }
    out.vis = document.visibilityState;
    const v = document.querySelector('video');
    out.video = v ? { rs: v.readyState, w: v.videoWidth, h: v.videoHeight } : null;
    return JSON.stringify(out);
  })()`, returnByValue: true });
  console.log('STATE: ' + r.result.result.value);
  sock.close();
})().catch(e => console.log('ERR ' + e.message));
