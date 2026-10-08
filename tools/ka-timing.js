// 真实场景计时：先把菜单打开，再跑保活，测量从"发出请求"到"菜单稳定关闭"的真实耗时
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => { try { s(JSON.parse(d)); } catch (e) { j(new Error('bad')); } });
}).on('error', j));

(async () => {
  const tabs = await getJ('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('arm-game'));
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', e => { const j = JSON.parse(e.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});
  const ev = async (e, aw) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: !!aw });
    if (r.result && r.result.exceptionDetails) return 'EXC';
    return r.result.result.value;
  };
  const menuOpen = () => ev(`(function(){const b=document.querySelector('.setting-box');return !!(b&&/focus/.test(b.className))})()`);

  await send('Target.activateTarget', { targetId: tab.id });
  await sleep(500);

  // 用真实指针打开菜单：hover 左边缘 -> 点设置按钮
  console.log('=== 打开菜单 ===');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 126, button: 'none' });
  await sleep(400);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 36, y: 126, button: 'none' });
  await sleep(200);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 36, y: 126, button: 'left', clickCount: 1 });
  await sleep(70);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 36, y: 126, button: 'left', clickCount: 1 });
  await sleep(1200);
  console.log('菜单已打开:', await menuOpen());

  console.log('\n=== 跑一次保活（菜单是开着的）===');
  const t0 = Date.now();
  const r = await ev(`(async()=>{try{return await __narutoAuto.keepAlive()}catch(e){return 'ERR:'+e.message}})()`, true);
  const dt = Date.now() - t0;
  console.log(`keepAlive() 返回=${r}  耗时=${dt}ms`);
  console.log('返回瞬间 菜单还在开?', await menuOpen());
  await sleep(400);
  console.log('+400ms 菜单还在开?', await menuOpen());
  await sleep(600);
  console.log('+1000ms 菜单还在开?', await menuOpen());
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
