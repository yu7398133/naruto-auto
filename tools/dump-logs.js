// 直接从运行中的页面里把完整日志取出来（绕过导出时的截断/清空）
(async () => {
  const http = require('http');
  const getJSON = (p) => new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });

  const tabs = await getJSON('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('arm-game'));
  if (!tab) { console.log('未找到游戏页'); process.exit(1); }

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', ev => { const j = JSON.parse(ev.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});

  const expr = `(function(){
    const A = window.__narutoAuto;
    if (!A) return JSON.stringify({err:'no __narutoAuto'});
    const out = { version: A.VERSION || A.version || '?' };
    // 尽力找出日志数组
    const cands = ['logs','_logs','logList','_logList','history','_history'];
    let arr = null, key = null;
    for (const k of cands) { if (Array.isArray(A[k])) { arr = A[k]; key = k; break; } }
    if (!arr) {
      for (const k of Object.keys(A)) { if (Array.isArray(A[k]) && A[k].length && typeof A[k][0] === 'object') { arr = A[k]; key = k; break; } }
    }
    if (!arr) return JSON.stringify({version: out.version, err:'no log array', keys: Object.keys(A).slice(0,40)});
    out.key = key; out.count = arr.length;
    out.tail = arr.slice(-120).map(e => (typeof e === 'string') ? e : (e.text || e.msg || e.message || JSON.stringify(e)));
    return JSON.stringify(out);
  })()`;

  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  const val = r?.result?.result?.value;
  try {
    const o = JSON.parse(val);
    console.log('版本:', o.version, '| 日志数组:', o.key, '| 条数:', o.count);
    if (o.err) { console.log('ERR:', o.err, '| keys:', (o.keys||[]).join(',')); }
    if (o.tail) { console.log('--- TAIL ---'); o.tail.forEach(l => console.log(l)); }
  } catch (e) { console.log('RAW:', String(val).slice(0, 3000)); }
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
