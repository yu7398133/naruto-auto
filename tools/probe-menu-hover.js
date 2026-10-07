// 验证 .setting-btn 是否靠 hover 滑入；找到真正可点的悬停触发方式
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

  const geom = `(function(){
    const b = document.querySelector('.setting-btn');
    const sl = document.querySelector('.setting-list');
    const bx = document.querySelector('.setting-box');
    const g = e => { if(!e) return null; const r = e.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    return JSON.stringify({
      btn: g(b), list: g(sl), box: g(bx),
      btnParent: b && b.parentElement ? String(b.parentElement.className).slice(0,50) : '',
      boxParent: bx && bx.parentElement ? String(bx.parentElement.className).slice(0,50) : ''
    });
  })()`;
  const read = async () => JSON.parse((await send('Runtime.evaluate', { expression: geom, returnByValue: true })).result.result.value);

  console.log('① 初始:', JSON.stringify(await read()));

  // 悬停到左边缘，看按钮是否滑入
  for (const hx of [1, 3, 8]) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hx, y: 130, button: 'none' });
    await sleep(800);
    const g = await read();
    console.log(`② 移到 (${hx},130) 后:`, JSON.stringify(g));
  }

  // 用 CSS 强制显示按钮，验证点击后菜单是否开
  const forced = await send('Runtime.evaluate', { expression: `(function(){
    const b = document.querySelector('.setting-btn');
    if(!b) return 'no btn';
    b.style.transform='none'; b.style.left='0px'; b.style.opacity='1';
    const r = b.getBoundingClientRect();
    return JSON.stringify({ x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2),
                            w: Math.round(r.width), h: Math.round(r.height) });
  })()`, returnByValue: true });
  console.log('③ 强制移入后:', forced.result.result.value);

  const info = JSON.parse(forced.result.result.value);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: info.x, y: info.y, button: 'none' });
  await sleep(150);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: info.x, y: info.y, button: 'left', clickCount: 1 });
  await sleep(80);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: info.x, y: info.y, button: 'left', clickCount: 1 });
  await sleep(1200);
  const after = await read();
  console.log('④ 点击后:', JSON.stringify(after));
  console.log('\n== 菜单是否打开（list.x >= 0）==', after.list && after.list.x >= 0);
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
