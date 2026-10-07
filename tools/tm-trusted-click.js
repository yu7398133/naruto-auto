// 用 CDP Input.dispatchMouseEvent 产生真实（trusted）点击
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});

(async () => {
  const tabs = await getJSON('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('ask.html'));
  if (!tab) { console.log('未找到 ask.html'); process.exit(1); }

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => {
    const i = ++id; pend.set(i, r);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
  ws.addEventListener('message', ev => {
    const j = JSON.parse(ev.data);
    if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); }
  });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});
  await send('Page.enable', {});

  // 1) 取按钮坐标
  const r = await send('Runtime.evaluate', {
    expression: `(() => {
      const b = Array.from(document.querySelectorAll('input.button'))
        .find(x => /重新安装/.test(x.value || ''));
      if (!b) return null;
      const rc = b.getBoundingClientRect();
      return JSON.stringify({ x: rc.x + rc.width/2, y: rc.y + rc.height/2, w: rc.width, h: rc.height });
    })()`,
    returnByValue: true
  });
  const box = JSON.parse(r.result.result.value);
  console.log('按钮中心坐标:', box);

  const x = box.x, y = box.y;

  // 2) 真实鼠标事件序列
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', clickCount: 0 });
  await sleep(120);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(80);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  console.log('已发送 trusted 点击');

  await sleep(4000);
  const after = await send('Runtime.evaluate', {
    expression: 'JSON.stringify({url: location.href, title: document.title})',
    returnByValue: true
  });
  console.log('点击后:', after.result.result.value);
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
