// 确认菜单态特征 + 找出最安全的"退出菜单"点击位置
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

  const probe = `(function(){
    const sl = document.querySelector('.setting-list');
    const sb = document.querySelector('.setting-box');
    const v = document.querySelector('video');
    const at = (x,y) => { const e = document.elementFromPoint(x,y);
      return e ? (e.tagName + (e.className ? '.' + String(e.className).split(' ')[0] : '')) : null; };
    // 找 .setting-container 的覆盖范围
    const sc = document.querySelector('.setting-container');
    const scr = sc ? sc.getBoundingClientRect() : null;
    return JSON.stringify({
      open: sl ? Math.round(sl.getBoundingClientRect().x) > -10 : null,
      focus: sb ? /focus/.test(sb.className) : null,
      containerRect: scr ? { x: Math.round(scr.x), y: Math.round(scr.y), w: Math.round(scr.width), h: Math.round(scr.height) } : null,
      // 采样多个点，看菜单态下哪些点是 container、哪些是 video
      samples: [[300,100],[960,100],[1200,100],[300,400],[700,400],[960,400],[1200,400],[1500,400],[960,620],[1500,620]].map(([x,y]) => ({ p: x+','+y, el: at(x,y) })),
      video: v ? { rs: v.readyState } : null
    });
  })()`;
  const read = async () => JSON.parse((await send('Runtime.evaluate', { expression: probe, returnByValue: true })).result.result.value);

  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    await sleep(120);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(70);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(900);
  };

  console.log('① 当前(菜单态?):', JSON.stringify(await read(), null, 1));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
