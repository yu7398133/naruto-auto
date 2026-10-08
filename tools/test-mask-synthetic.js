// 验证：页面能否通过 CDP HTTP 端点反向探测/驱动外部进程？
// 以及：如果代理没在跑，页面还能不能自救（纯页内方案有没有别的可能）
(async () => {
  const http = require('http');
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
    const r = await send('Runtime.evaluate', {
      expression: e, returnByValue: true, awaitPromise: !!aw,
      // 允许页面内的异步
    });
    if (r.result && r.result.exceptionDetails) return 'EXC: ' + String(JSON.stringify(r.result.exceptionDetails)).slice(0, 260);
    return r.result.result.value;
  };

  console.log('① 页面能否 fetch 到 CDP 端点（跨端口同源策略试验）');
  console.log(await ev(`(async()=>{ try{
      const r = await fetch('http://127.0.0.1:9222/json/version');
      const j = await r.json(); return '可达: '+(j.Browser||'?');
    }catch(e){ return '被拒: '+e.message; } })()`, true));

  console.log('\n② 页面自己的 origin');
  console.log(await ev('location.origin'));

  console.log('\n③ 关键：菜单打开后，能否用「页内合成事件」点掉遮罩退出？');
  console.log('   先开菜单（用真实点击，确保是开的）…');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 126, button: 'none' });
  await new Promise(r => setTimeout(r, 400));
  for (const t of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type: t, x: 36, y: 126, button: 'left', clickCount: 1 });
    await new Promise(r => setTimeout(r, 80));
  }
  await new Promise(r => setTimeout(r, 900));
  console.log('   菜单状态:', await ev(`(function(){const b=document.querySelector('.setting-box');return b?/focus/.test(b.className):null;})()`));

  console.log('\n④ 用页内合成 click 点遮罩 (960,400)…');
  console.log('   ', await ev(`(function(){
    const el=document.elementFromPoint(960,400);
    if(!el) return 'no element';
    const init={bubbles:true,cancelable:true,composed:true,view:window,clientX:960,clientY:400,button:0,buttons:0};
    const fire=(t,C)=>{let e;try{e=new C(t,init)}catch(_){e=new MouseEvent(t,init)};el.dispatchEvent(e)};
    const P=window.PointerEvent||MouseEvent;
    fire('pointerdown',P);fire('mousedown',MouseEvent);fire('pointerup',P);fire('mouseup',MouseEvent);fire('click',MouseEvent);
    return 'fired on '+el.tagName+'.'+String(el.className).slice(0,30);})()`));
  await new Promise(r => setTimeout(r, 1000));
  console.log('   菜单状态:', await ev(`(function(){const b=document.querySelector('.setting-box');return b?/focus/.test(b.className):null;})()`));

  console.log('\n⑤ 收尾：CDP 真实点击退出');
  for (const t of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type: t, x: 960, y: 400, button: t === 'mouseMoved' ? 'none' : 'left', clickCount: t === 'mouseMoved' ? 0 : 1 });
    await new Promise(r => setTimeout(r, 120));
  }
  await new Promise(r => setTimeout(r, 900));
  console.log('   最终菜单态:', await ev(`(function(){const b=document.querySelector('.setting-box');return b?/focus/.test(b.className):null;})()`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
