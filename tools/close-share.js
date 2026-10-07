// 用真实 CDP 鼠标事件点击 share-wrap 的关闭按钮，然后验证弹窗消失
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

  // 1) 关闭前：定位按钮
  const before = await send('Runtime.evaluate', { expression: `(function(){
    const b = document.querySelector('.share-wrap .close-btn');
    if (!b) return JSON.stringify({ found:false });
    const r = b.getBoundingClientRect();
    return JSON.stringify({ found:true,
      x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2),
      w: Math.round(r.width), h: Math.round(r.height),
      cursor: getComputedStyle(b).cursor,
      hasShareWrap: !!document.querySelector('.share-wrap') });
  })()`, returnByValue: true });
  const info = JSON.parse(before.result.result.value);
  console.log('关闭前:', JSON.stringify(info));
  if (!info.found) { console.log('没找到关闭按钮，弹窗可能已关'); ws.close(); return; }

  // 2) 真实鼠标事件：move → down → up
  const { x, y } = info;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
  await sleep(120);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await sleep(90);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  console.log(`已点击 close-btn @(${x},${y})`);

  await sleep(1200);

  // 3) 验证
  const after = await send('Runtime.evaluate', { expression: `(function(){
    const v = document.querySelector('video');
    return JSON.stringify({
      hasShareWrap: !!document.querySelector('.share-wrap'),
      hasMessageWrap: !!document.querySelector('.message-wrap'),
      videoCount: document.querySelectorAll('video').length,
      video: v ? { rs: v.readyState, paused: v.paused, w: v.videoWidth } : null,
      panel: !!document.querySelector('#na-panel')
    });
  })()`, returnByValue: true });
  console.log('关闭后:', after.result.result.value);
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
