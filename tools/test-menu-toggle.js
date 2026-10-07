// 实测 .setting-btn 开/关菜单：副作用、是否影响 video、坐标稳定性
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

  const state = `(function(){
    const b = document.querySelector('.setting-btn');
    const sl = document.querySelector('.setting-list');
    const v = document.querySelector('video');
    const br = b ? b.getBoundingClientRect() : null;
    const sr = sl ? sl.getBoundingClientRect() : null;
    return JSON.stringify({
      btn: br ? { x: Math.round(br.x+br.width/2), y: Math.round(br.y+br.height/2),
                  w: Math.round(br.width), h: Math.round(br.height),
                  cur: getComputedStyle(b).cursor } : null,
      listX: sr ? Math.round(sr.x) : null,
      listOpen: sr ? sr.x >= -10 : null,
      video: v ? { rs: v.readyState, paused: v.paused } : null
    });
  })()`;
  const read = async () => JSON.parse((await send('Runtime.evaluate', { expression: state, returnByValue: true })).result.result.value);

  const before = await read();
  console.log('① 点击前:', JSON.stringify(before));

  const click = async (note) => {
    const { x, y } = before.btn;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    await sleep(100);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(70);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(900);
    const st = await read();
    console.log(note, JSON.stringify(st));
    return st;
  };

  const opened = await click('② 点一次:');
  const closed = await click('③ 再点一次:');

  console.log('\n== 结论 ==');
  console.log('  按钮坐标      :', JSON.stringify(before.btn));
  console.log('  菜单开启后 x  :', opened.listX, '(>=0 表示滑出可见)');
  console.log('  再点后 x      :', closed.listX);
  console.log('  菜单可开可关  :', opened.listOpen && !closed.listOpen);
  console.log('  video 全程    :', JSON.stringify(before.video), '→', JSON.stringify(opened.video), '→', JSON.stringify(closed.video));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
