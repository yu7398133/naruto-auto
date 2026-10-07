// 关掉遗留的菜单（toggle 一次），并确认恢复原状
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

  const st = `(function(){
    const b = document.querySelector('.setting-btn');
    const sl = document.querySelector('.setting-list');
    const v = document.querySelector('video');
    const br = b ? b.getBoundingClientRect() : null;
    const sr = sl ? sl.getBoundingClientRect() : null;
    return JSON.stringify({
      btnX: br ? Math.round(br.x + br.width/2) : null,
      btnY: br ? Math.round(br.y + br.height/2) : null,
      listX: sr ? Math.round(sr.x) : null,
      open: sr ? sr.x >= -10 : null,
      video: v ? { rs: v.readyState, paused: v.paused } : null
    });
  })()`;
  const read = async () => JSON.parse((await send('Runtime.evaluate', { expression: st, returnByValue: true })).result.result.value);

  let s = await read();
  console.log('当前:', JSON.stringify(s));
  if (!s.open) { console.log('菜单本来就是关的，无需处理'); ws.close(); return; }

  // 先 hover 引出按钮，再点
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 126, button: 'none' });
  await sleep(400);
  const s2 = await read();
  const x = s2.btnX > 0 ? s2.btnX : 36, y = s2.btnY || 126;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
  await sleep(150);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await sleep(80);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(1000);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 960, y: 660, button: 'none' });
  await sleep(400);

  const s3 = await read();
  console.log('关闭后:', JSON.stringify(s3));
  console.log(s3.open ? '❌ 菜单仍开着' : '✅ 菜单已收回，画面复原');
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
