// 验证：菜单打开后，仅 toggle 是否足够复原？还是必须在右侧画面点一下？
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

  // 目标元素：(400,400) 处是什么？菜单态下云游戏应该有个"点击继续"的遮罩
  const probe = `(function(){
    const sl = document.querySelector('.setting-list');
    const sb = document.querySelector('.setting-box');
    const v = document.querySelector('video');
    const el = document.elementFromPoint(960, 400);
    return JSON.stringify({
      listX: sl ? Math.round(sl.getBoundingClientRect().x) : null,
      boxCls: sb ? String(sb.className) : null,
      at960: el ? (el.tagName + '.' + String(el.className).slice(0,40)) : null,
      video: v ? { rs: v.readyState, paused: v.paused } : null
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

  console.log('① 初始:', JSON.stringify(await read()));

  // hover 引出按钮
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 126, button: 'none' });
  await sleep(450);
  const b = await read();
  console.log('② hover 后:', JSON.stringify(b));

  // 打开菜单
  await click(36, 126);
  const opened = await read();
  console.log('③ 打开菜单:', JSON.stringify(opened));

  // 只点按钮 toggle 关掉（我原来的做法）
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 126, button: 'none' });
  await sleep(300);
  await click(36, 126);
  const toggled = await read();
  console.log('④ 仅 toggle 关闭:', JSON.stringify(toggled));

  // 在右侧游戏画面点一下
  await click(960, 400);
  const afterClick = await read();
  console.log('⑤ 右侧画面点一下后:', JSON.stringify(afterClick));

  console.log('\n== 差异 ==');
  console.log('  toggle 后 boxCls :', toggled.boxCls);
  console.log('  画面点击后 boxCls:', afterClick.boxCls);
  console.log('  (boxCls 里的 focus 是否消失，代表菜单态是否真正退出)');
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
