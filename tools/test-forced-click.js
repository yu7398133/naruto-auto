// 关键验证：用 CSS 强制显示按钮后，合成 click 能否真正打开菜单？
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

  const state = () => ev(`(function(){
    const sb=document.querySelector('.setting-box'), sl=document.querySelector('.setting-list'), b=document.querySelector('.setting-btn');
    const r=b?b.getBoundingClientRect():null;
    return JSON.stringify({ focus: sb?/focus/.test(sb.className):null,
      listX: sl?Math.round(sl.getBoundingClientRect().x):null,
      btnX: r?Math.round(r.x):null,
      at960: (document.elementFromPoint(960,400)||{}).tagName });})()`);

  console.log('① 初始:', await state());

  // 强制显示按钮
  console.log('\n② 用 CSS 强制把按钮移入视口…');
  console.log(await ev(`(function(){
    const b=document.querySelector('.setting-btn');
    if(!b) return 'no btn';
    b.style.transform='translateX(0px)';
    b.style.transition='none';
    const r=b.getBoundingClientRect();
    return 'btn now at x='+Math.round(r.x)+' center='+Math.round(r.x+r.width/2)+','+Math.round(r.y+r.height/2);})()`));
  console.log('   状态:', await state());

  // 用合成事件点它（domClick 的方式）
  console.log('\n③ 合成 click（domClick 方式）…');
  console.log('   ', await ev(`(function(){
    const r = window.__narutoAuto.sdk.domClick(36,126,{selector:'.setting-btn'});
    return JSON.stringify(r);})()`));
  await sleep(1000);
  console.log('   状态:', await state());

  // 若没开，改用 CDP 真实点击对照
  const s = JSON.parse(await state());
  if (!s.focus) {
    console.log('\n④ 合成没生效 → 用 CDP 真实鼠标点击对照…');
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 36, y: 126, button: 'none' });
    await sleep(200);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 36, y: 126, button: 'left', clickCount: 1 });
    await sleep(80);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 36, y: 126, button: 'left', clickCount: 1 });
    await sleep(1200);
    console.log('   状态:', await state());
  }

  // 收尾：退出菜单 + 恢复 transform
  console.log('\n⑤ 收尾…');
  await ev(`(function(){const b=document.querySelector('.setting-btn');if(b){b.style.transform='';b.style.transition='';}return 'restored';})()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 960, y: 400, button: 'none' });
  await sleep(150);
  for (const t of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type: t, x: 960, y: 400, button: 'left', clickCount: 1 });
    await sleep(80);
  }
  await sleep(1000);
  console.log('   最终:', await state());
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
