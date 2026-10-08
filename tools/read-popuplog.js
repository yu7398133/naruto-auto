// 读取页面记录的弹窗历史
const http = require('http');
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => { try { s(JSON.parse(d)); } catch (e) { j(new Error('bad')); } });
}).on('error', j));

(async () => {
  const tabs = await getJ('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('arm-game'));
  if (!tab) { console.log('没有云游戏页'); return; }
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

  console.log('=== 页面记录的弹窗历史 ===');
  console.log(await ev(`JSON.stringify(__narutoAuto.popupLog(), null, 1)`));

  console.log('\n=== 保活记录（probes 里的 keepalive）===');
  console.log(await ev(`(function(){
    const ps=(__narutoAuto.probes||[]).filter(p=>p.kind==='keepalive');
    return JSON.stringify({总数:ps.length, 最近:ps.slice(-5)});
  })()`));

  console.log('\n=== 调度器状态 ===');
  console.log(await ev(`(function(){
    const s=__narutoAuto.scheduler;
    if(!s) return 'none';
    return JSON.stringify({running:!!s.running, mode:__narutoAuto.config&&__narutoAuto.config.mode});
  })()`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
