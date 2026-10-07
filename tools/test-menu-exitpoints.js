// 系统测试：菜单态下点哪些位置能退出？逐点验证
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
  const stateOf = () => ev(`(function(){
    const sb=document.querySelector('.setting-box');
    const sl=document.querySelector('.setting-list');
    return JSON.stringify({ focus: sb?/focus/.test(sb.className):null,
      listX: sl?Math.round(sl.getBoundingClientRect().x):null });})()`);
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    await sleep(110);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(70);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(1000);
  };
  const openMenu = async () => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 126, button: 'none' });
    await sleep(450);
    await click(36, 126);
  };
  // 强制复位：反复点直到 focus 消失
  const forceClose = async () => {
    for (let i = 0; i < 6; i++) {
      const s = JSON.parse(await stateOf());
      if (!s.focus) return true;
      await click(960, 400);
    }
    return false;
  };

  console.log('起始:', await stateOf());
  await forceClose();
  console.log('复位后:', await stateOf());

  const pts = [[960,400],[1000,300],[1600,500],[1880,640],[400,600],[700,200],[1200,600]];
  for (const [x,y] of pts) {
    await openMenu();
    const o = JSON.parse(await stateOf());
    if (!o.focus) { console.log(`(${x},${y}) 菜单没打开，跳过`); continue; }
    await click(x, y);
    const s = JSON.parse(await stateOf());
    console.log(`点 (${x},${y}) → focus=${s.focus} listX=${s.listX} ${s.focus?'❌未退出':'✅退出'}`);
    await forceClose();
  }
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
