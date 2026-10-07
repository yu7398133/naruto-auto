// 直接实测「第X回」探针: 采样 N 次, 报分数分布
(async () => {
  const http = require('http');
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
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

  // 检查脚本是否在页面里
  const chk = await send('Runtime.evaluate', {
    expression: `(function(){
      if (typeof __narutoAuto === 'undefined') return 'NO_SCRIPT';
      const v = __narutoAuto;
      return 'OK version=' + (v.VERSION || v.version || '?');
    })()`, returnByValue: true
  });
  console.log('脚本状态:', chk?.result?.result?.value);
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
