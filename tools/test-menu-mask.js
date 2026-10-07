// 确认 setting-container 是全屏遮罩且"点任意处即退出"，并验证退出后画面真的在动
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

  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    await sleep(100);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(70);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(900);
  };
  const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result.result.value;

  // 当前应还是菜单态
  console.log('起始 boxCls:', await ev(`(function(){const b=document.querySelector('.setting-box');return b?b.className:'?';})()`));

  // setting-container 的样式
  console.log('\n.setting-container 样式:', await ev(`(function(){
    const c=document.querySelector('.setting-container');
    if(!c) return 'null';
    const r=c.getBoundingClientRect(); const cs=getComputedStyle(c);
    return JSON.stringify({ rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},
      z:cs.zIndex, bg:cs.backgroundColor, cur:cs.cursor, pointerEvents:cs.pointerEvents });
  })()`));

  // 用一个角落点退出（右下 1880,640）
  await click(1880, 640);
  const st = await ev(`(function(){
    const sl=document.querySelector('.setting-list');
    const sb=document.querySelector('.setting-box');
    const e=document.elementFromPoint(960,400);
    return JSON.stringify({ listX: sl?Math.round(sl.getBoundingClientRect().x):null,
      boxCls: sb?sb.className:null, at960: e?e.tagName:null });})()`);
  console.log('\n点右下角 (1880,640) 后:', st);

  // 验证画面真的在动（取两帧比较 currentTime 和像素）
  const frameA = await ev(`(function(){const v=document.querySelector('video');return v?JSON.stringify({t:v.currentTime,rs:v.readyState,p:v.paused}):'null';})()`);
  await sleep(2500);
  const frameB = await ev(`(function(){const v=document.querySelector('video');return v?JSON.stringify({t:v.currentTime,rs:v.readyState,p:v.paused}):'null';})()`);
  console.log('\n画面活性: ', frameA, '→', frameB);
  console.log('currentTime 前进:', (JSON.parse(frameB).t - JSON.parse(frameA).t).toFixed(2), '秒');
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
