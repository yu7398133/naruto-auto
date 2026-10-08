// 确认自启代理确实在服务：问页面 kaExternalAlive + 读日志 + 看进程
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});

(async () => {
  const tabs = await getJSON('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('arm-game'));
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', ev => { const j = JSON.parse(ev.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});
  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return 'EXC: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 150);
    return r.result.result.value;
  };

  console.log('代理在线标志 kaExternalAlive():', await ev('typeof __narutoAuto.kaExternalAlive==="function" ? __narutoAuto.kaExternalAlive() : "无此API"'));
  console.log('kaPing 时间戳:', await ev('__narutoAuto.__kaSeenAt || 0'));

  console.log('\n== 真实触发一次保活（模拟静默期）==');
  console.log('保活前菜单态:', await ev(`(function(){const b=document.querySelector('.setting-box');return b?/focus/.test(b.className):null;})()`));
  const r = await ev('__narutoAuto.keepAlive()', true).catch(e => 'ERR ' + e.message);
  // keepAlive 是 async，用 awaitPromise
  const r2 = await send('Runtime.evaluate', {
    expression: '__narutoAuto.keepAlive()', returnByValue: true, awaitPromise: true,
  });
  console.log('keepAlive() 返回:', r2.result.result.value, r2.result.exceptionDetails ? JSON.stringify(r2.result.exceptionDetails).slice(0, 150) : '');
  console.log('保活后菜单态:', await ev(`(function(){const b=document.querySelector('.setting-box');return b?/focus/.test(b.className):null;})()`));
  console.log('video:', await ev(`(function(){const v=document.querySelector('video');return v?JSON.stringify({rs:v.readyState,paused:v.paused,t:+v.currentTime.toFixed(1)}):'none';})()`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
