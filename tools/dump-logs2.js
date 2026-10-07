// 精确取: (a) 版本 (b) 日志缓冲 (c) 最近一次忍术对战的结束原因
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
    const out = {};
    // 版本
    out.version = A.VERSION || (A.app && A.app.VERSION) || '?';
    // 面板持有日志
    const panel = A.panel || (A.app && A.app.panel);
    if (panel) {
      out.panelKeys = Object.keys(panel).filter(k=>/log|hist/i.test(k));
      for (const k of out.panelKeys) {
        const v = panel[k];
        if (Array.isArray(v) && v.length) {
          out.logCount = v.length;
          out.tail = v.slice(-80).map(e => typeof e === 'string' ? e : (e.text || e.msg || e.message || JSON.stringify(e)));
          break;
        }
      }
    }
    // 顶层任何叫 log* 的数组
    if (!out.tail) {
      const ks = Object.keys(A).filter(k=>/log/i.test(k));
      out.topLogKeys = ks;
      for (const k of ks) { if (Array.isArray(A[k]) && A[k].length) {
        out.logCount = A[k].length;
        out.tail = A[k].slice(-80).map(e => typeof e === 'string' ? e : (e.text||e.msg||JSON.stringify(e)));
        break; } }
    }
    return JSON.stringify(out);
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  const val = r?.result?.result?.value;
  console.log('RAW len:', String(val||'').length);
  console.log(String(val).slice(0, 12000));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
