// 找出到底是什么让 .setting-btn 滑入视口
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
  const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result.result.value;

  const bx = () => ev(`(function(){const b=document.querySelector('.setting-btn');
    if(!b)return 'null';const r=b.getBoundingClientRect();
    const cs=getComputedStyle(b);
    return JSON.stringify({x:Math.round(r.x),w:Math.round(r.width),op:cs.opacity,tr:cs.transform,tf:cs.transition,left:cs.left,disp:cs.display,vis:cs.visibility});})()`);

  console.log('初始:', await bx());

  console.log('\n-- 场景A: 只发 DOM 事件（domHover 方式）--');
  console.log(await ev(`(function(){
    const b=document.querySelector('.setting-btn');
    const init={bubbles:true,cancelable:true,composed:true,view:window,clientX:2,clientY:126};
    const fire=(t,C)=>{let e;try{e=new C(t,init)}catch(_){e=new MouseEvent(t,init)};b.dispatchEvent(e)};
    const P=window.PointerEvent||MouseEvent;
    fire('pointerover',P);fire('pointerenter',P);fire('mouseover',MouseEvent);fire('mousemove',MouseEvent);
    return 'fired on .setting-btn';})()`));
  await sleep(700); console.log('  按钮:', await bx());

  console.log('\n-- 场景B: 发到 document / 左边缘元素 --');
  console.log(await ev(`(function(){
    const el=document.elementFromPoint(2,126);
    const tgt=el||document.body;
    const init={bubbles:true,cancelable:true,composed:true,view:window,clientX:2,clientY:126};
    const fire=(t,C)=>{let e;try{e=new C(t,init)}catch(_){e=new MouseEvent(t,init)};tgt.dispatchEvent(e)};
    const P=window.PointerEvent||MouseEvent;
    fire('pointerover',P);fire('pointerenter',P);fire('mouseover',MouseEvent);fire('mousemove',MouseEvent);
    return 'fired on '+(tgt.tagName+'.'+String(tgt.className).slice(0,30));})()`));
  await sleep(700); console.log('  按钮:', await bx());

  console.log('\n-- 场景C: CDP 真实鼠标移动 --');
  for (const x of [1, 40, 100]) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: 126, button: 'none' });
    await sleep(500);
    console.log(`  移到 (${x},126):`, await bx());
  }
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
