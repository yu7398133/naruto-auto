// v0.6.47 保活端到端：菜单开→关、画面复原、video 不受影响
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
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', ev => { const j = JSON.parse(ev.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});
  const ev = async (e, aw) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: !!aw });
    if (r.result && r.result.exceptionDetails) return 'EXC: ' + String(JSON.stringify(r.result.exceptionDetails)).slice(0, 200);
    return r.result.result.value;
  };

  console.log('① 钩子自检:', await ev(`(function(){
    const A=window.__narutoAuto;
    return JSON.stringify({
      hasMenu: typeof A.menu, hasKA: typeof A.keepAlive,
      stillHasCtxKey: 'ctx' in A,
      menuNow: A.menu ? A.menu() : null });})()`));

  console.log('\n② 保活前 video:', await ev(`(function(){const v=document.querySelector('video');
    return v?JSON.stringify({t:+v.currentTime.toFixed(2),rs:v.readyState,paused:v.paused}):'null';})()`));

  console.log('\n③ 调用 keepAlive() …');
  console.log('   返回:', await ev('window.__narutoAuto.keepAlive()', true));

  console.log('\n④ 保活后:', await ev(`(function(){
    const sb=document.querySelector('.setting-box');
    const sl=document.querySelector('.setting-list');
    const e=document.elementFromPoint(960,400);
    const v=document.querySelector('video');
    return JSON.stringify({ focus: sb?/focus/.test(sb.className):null,
      listX: sl?Math.round(sl.getBoundingClientRect().x):null,
      at960: e?e.tagName:null,
      video: v?{rs:v.readyState,paused:v.paused,t:+v.currentTime.toFixed(2)}:null });})()`));

  const t1 = +(await ev(`document.querySelector('video').currentTime`));
  await sleep(2500);
  const t2 = +(await ev(`document.querySelector('video').currentTime`));
  console.log('⑤ 画面活性: currentTime', t1.toFixed(2), '→', t2.toFixed(2), `(+${(t2 - t1).toFixed(2)}s)`);

  console.log('\n⑥ 面板日志:', await ev(`(function(){const p=document.querySelector('#na-panel');if(!p)return '(无面板)';
    const ls=(p.innerText||'').split('\\n').filter(l=>/保活|菜单|复原/.test(l));
    return ls.length?ls.slice(-8).join('\\n'):'(无保活日志)';})()`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
