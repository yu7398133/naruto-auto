// 直接调 __narutoAuto.keepAlive() 端到端验证保活：菜单开→关、画面复原、video 不受影响
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
  const ev = async (e, awaitP) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: !!awaitP });
    if (r.result && r.result.exceptionDetails) return 'EXC: ' + JSON.stringify(r.result.exceptionDetails).slice(0,300);
    return r.result.result.value;
  };

  console.log('版本自检:', await ev(`(function(){
    const A=window.__narutoAuto;
    return JSON.stringify({ hasMenu: typeof A.menu==='function',
      hasKeepAlive: typeof A.keepAlive==='function',
      hasCtx: !!A.ctx,
      hasCtxKeepAlive: !!(A.ctx && typeof A.ctx._keepAliveMenu==='function'),
      menuNow: A.menu ? A.menu() : null });})()`));

  console.log('\n保活前 video:', await ev(`(function(){const v=document.querySelector('video');
    return v?JSON.stringify({t:+v.currentTime.toFixed(2),rs:v.readyState,p:v.paused}):'null';})()`));

  console.log('\n▶ 调用 __narutoAuto.keepAlive() …');
  const r = await ev('window.__narutoAuto.keepAlive()', true);
  console.log('返回:', r);

  const after = await ev(`(function(){
    const sb=document.querySelector('.setting-box');
    const sl=document.querySelector('.setting-list');
    const e=document.elementFromPoint(960,400);
    const v=document.querySelector('video');
    return JSON.stringify({ focus: sb?/focus/.test(sb.className):null,
      listX: sl?Math.round(sl.getBoundingClientRect().x):null,
      at960: e?e.tagName:null,
      video: v?{rs:v.readyState,p:v.paused,t:+v.currentTime.toFixed(2)}:null });})()`);
  console.log('\n保活后:', after);

  // 画面是否真的在动
  const t1 = await ev(`document.querySelector('video').currentTime`);
  await sleep(2500);
  const t2 = await ev(`document.querySelector('video').currentTime`);
  console.log('画面活性: currentTime', (+t1).toFixed(2), '→', (+t2).toFixed(2), `(+${(t2-t1).toFixed(2)}s)`);

  console.log('\n== 面板日志（保活相关）==');
  console.log(await ev(`(function(){const p=document.querySelector('#na-panel');if(!p)return '(无)';
    return (p.innerText||'').split('\\n').filter(l=>/保活|菜单|复原/.test(l)).slice(-10).join('\\n')||'(无保活日志)';})()`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
