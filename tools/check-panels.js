// 干净读取当前页面面板状态（不修改任何东西）
const http = require('http');
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => { try { s(JSON.parse(d)); } catch (e) { j(new Error('bad')); } });
}).on('error', j));

(async () => {
  const tabs = await getJ('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('arm-game'));
  console.log('页面:', (tab.title || '').slice(0, 34));
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', e => { const j = JSON.parse(e.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});
  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return 'EXC';
    return r.result.result.value;
  };

  const raw = await ev(`JSON.stringify({
    panel: document.querySelectorAll('#na-panel').length,
    fab: document.querySelectorAll('#na-fab').length,
    vers: [...document.querySelectorAll('#na-panel')].map(p=>(p.textContent.match(/v([\\d.]+)/)||[])[1]),
    bodyKids: [...document.body.children].map(e=>e.id||e.tagName).filter(x=>/na-|app/i.test(x)),
    hasAuto: typeof window.__narutoAuto,
    ver: (function(){try{return document.querySelector('#na-panel').textContent.match(/v([\\d.]+)/)[1]}catch(e){return null}})()
  }, null, 1)`);
  console.log(raw);
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
