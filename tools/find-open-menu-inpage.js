// 关键最后一问：不用真实鼠标，页内有没有任何办法把菜单打开？
// 思路A: 直接改 Vue 组件内部状态（若有 __vue__）
// 思路B: 直接给 .setting-btn 触发它绑定的 handler（若绑定在元素上，合成事件应能触发）
// 思路C: 用 CSS 让按钮常显 + 合成事件点它（先前失败，复查是否因为 hover 未建立）
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
    if (r.result && r.result.exceptionDetails) return 'EXC: ' + String(JSON.stringify(r.result.exceptionDetails)).slice(0, 240);
    return r.result.result.value;
  };
  const isOpen = () => ev(`(function(){const b=document.querySelector('.setting-box');return b?/focus/.test(b.className):null;})()`);
  const reset = async () => {
    // 真实点击退出，保证干净的起始态
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 960, y: 400, button: 'none' });
    for (const t of ['mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', { type: t, x: 960, y: 400, button: 'left', clickCount: 1 });
      await sleep(80);
    }
    await sleep(700);
  };
  await reset();
  console.log('起始菜单态:', await isOpen());

  console.log('\n── 思路A: Vue 内部实例 ──');
  console.log(await ev(`(function(){
    const b=document.querySelector('.setting-btn');
    if(!b) return 'no btn';
    const keys=Object.keys(b).filter(k=>k.startsWith('__'));
    const box=b.closest('.setting-box');
    const boxKeys=box?Object.keys(box).filter(k=>k.startsWith('__')):[];
    return JSON.stringify({btnVueKeys:keys, boxVueKeys:boxKeys,
      btnParentVue: !!(b.__vueParentComponent), boxVue: !!(box&&box.__vueParentComponent)});})()`));

  console.log('\n── 思路B: 直接调 Vue 组件方法（若拿得到实例）──');
  console.log(await ev(`(function(){
    const b=document.querySelector('.setting-btn');
    const inst=b&&(b.__vueParentComponent||b.__vue__);
    if(!inst) return '拿不到 Vue 实例';
    const names=Object.keys(inst).slice(0,25);
    const setup=inst.setupState?Object.keys(inst.setupState).slice(0,25):null;
    return JSON.stringify({type:inst.type&&inst.type.__name, keys:names, setupKeys:setup});})()`));

  console.log('\n── 思路C: 强制显示 + 合成事件点按钮（重新验证）──');
  console.log(await ev(`(function(){
    const b=document.querySelector('.setting-btn');
    b.style.transform='translateX(0px)'; b.style.transition='none';
    const r=b.getBoundingClientRect();
    return 'pos='+Math.round(r.x)+','+Math.round(r.y);})()`));
  console.log('点击:', await ev(`(function(){
    const b=document.querySelector('.setting-btn');
    const init={bubbles:true,cancelable:true,composed:true,view:window,clientX:36,clientY:126,button:0,buttons:0};
    const P=window.PointerEvent||MouseEvent;
    for(const [t,C] of [['pointerover',P],['pointerenter',P],['pointerdown',P],['mousedown',MouseEvent],['pointerup',P],['mouseup',MouseEvent],['click',MouseEvent]]){
      let e; try{e=new C(t,init)}catch(_){e=new MouseEvent(t,init)}
      b.dispatchEvent(e);
    }
    return 'fired 7 events on .setting-btn';})()`));
  await sleep(1000);
  console.log('  菜单态:', await isOpen());

  console.log('\n── 思路D: 事件委托到祖先（有些框架把 handler 绑在容器上）──');
  console.log(await ev(`(function(){
    const b=document.querySelector('.setting-btn');
    const box=b.closest('.setting-box');
    const init={bubbles:true,cancelable:true,composed:true,view:window,clientX:36,clientY:126,button:0,buttons:0};
    const P=window.PointerEvent||MouseEvent;
    for(const [t,C] of [['pointerdown',P],['mousedown',MouseEvent],['pointerup',P],['mouseup',MouseEvent],['click',MouseEvent]]){
      let e; try{e=new C(t,init)}catch(_){e=new MouseEvent(t,init)}
      box.dispatchEvent(e);
    }
    return 'fired on .setting-box';})()`));
  await sleep(1000);
  console.log('  菜单态:', await isOpen());

  console.log('\n── 收尾 ──');
  console.log(await ev(`(function(){const b=document.querySelector('.setting-btn');b.style.transform='';b.style.transition='';return 'css restored';})()`));
  await reset();
  console.log('最终菜单态:', await isOpen());
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
