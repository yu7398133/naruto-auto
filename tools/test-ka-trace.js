// 触发一次真实保活，同时观察菜单是否真的开→关
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
  const ev = async (e, aw) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: !!aw });
    if (r.result && r.result.exceptionDetails) return 'EXC: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 160);
    return r.result.result.value;
  };

  const state = () => ev(`(function(){
    const sb=document.querySelector('.setting-box'), b=document.querySelector('.setting-btn');
    const r=b?b.getBoundingClientRect():null;
    return JSON.stringify({focus: sb?/focus/.test(sb.className):null, btnX: r?Math.round(r.x):null});})()`);

  console.log('保活前:', await state());
  console.log('菜单读取:', await ev('JSON.stringify(__narutoAuto.menu())'));

  // 手动登记一个请求，观察代理是否取走并执行
  await ev(`(function(){
    window.__testProbe = {taken:null, done:null};
    const origTake = __narutoAuto.kaTake;
    __narutoAuto.kaTake = function(){ const r = origTake(); if(r) window.__testProbe.taken = r; return r; };
    const origDone = __narutoAuto.kaDone;
    __narutoAuto.kaDone = function(i,ok){ window.__testProbe.done = {id:i, ok:ok}; return origDone(i,ok); };
    return 'wrapped';})()`);

  console.log('\n触发 keepAlive()（最多等 10 秒）…');
  const p = ev('__narutoAuto.keepAlive()', true);
  const r = await p;
  console.log('  keepAlive() 返回:', r);
  console.log('  代理取走的任务:', await ev('JSON.stringify(window.__testProbe.taken)'));
  console.log('  代理回报的结果:', await ev('JSON.stringify(window.__testProbe.done)'));
  await sleep(500);
  console.log('  保活后:', await state());
  console.log('  video:', await ev(`(function(){const v=document.querySelector('video');return v?JSON.stringify({rs:v.readyState,paused:v.paused}):'none';})()`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
