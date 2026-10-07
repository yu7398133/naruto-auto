// 完整安装流程：打开 user.js -> 等 ask.html -> 真实点击「安装」-> 验证
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const TARGET = process.argv[2] || 'http://127.0.0.1:8899/naruto-bg-watchdog.user.js';

const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0; const pend = new Map();
    const send = (m, p) => new Promise(r => {
      const i = ++id; pend.set(i, r);
      ws.send(JSON.stringify({ id: i, method: m, params: p }));
    });
    ws.addEventListener('message', ev => {
      const j = JSON.parse(ev.data);
      if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); }
    });
    ws.addEventListener('open', () => resolve({ ws, send }));
    ws.addEventListener('error', reject);
  });
}

(async () => {
  console.log('目标:', TARGET);

  // 1) 打开安装页
  const u = `http://127.0.0.1:9222/json/new?${encodeURIComponent(TARGET)}`;
  await new Promise((res, rej) => http.get(u, { method: 'PUT' }, r => { r.resume(); r.on('end', res); }).on('error', rej));
  await sleep(4500);

  // 2) 找 ask.html
  let tabs = await getJSON('/json/list');
  let ask = tabs.find(t => t.type === 'page' && t.url.includes('ask.html'));
  if (!ask) {
    console.log('未出现 ask.html。当前页面:');
    tabs.filter(t => t.type === 'page').forEach(t => console.log('  [' + t.title + '] ' + t.url.slice(0, 110)));
    process.exit(1);
  }
  console.log('确认页:', ask.title);

  const { ws, send } = await connect(ask.webSocketDebuggerUrl);
  await send('Runtime.enable', {});

  // 3) 取按钮坐标
  const rr = await send('Runtime.evaluate', {
    expression: `(() => {
      const b = Array.from(document.querySelectorAll('input.button, button'))
        .find(x => /安装|更新/.test(x.value || x.innerText || '') && !/取消/.test(x.value || x.innerText || ''));
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return JSON.stringify({ txt: b.value || b.innerText, x: r.x + r.width/2, y: r.y + r.height/2 });
    })()`,
    returnByValue: true
  });
  if (!rr.result.result.value) { console.log('未找到安装按钮'); ws.close(); process.exit(1); }
  const btn = JSON.parse(rr.result.result.value);
  console.log('按钮:', btn.txt, '坐标:', btn.x, btn.y);

  // 4) 真实鼠标点击
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: btn.x, y: btn.y, button: 'none' });
  await sleep(150);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: btn.x, y: btn.y, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(100);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: btn.x, y: btn.y, button: 'left', buttons: 0, clickCount: 1 });
  console.log('已点击');
  await sleep(4500);

  // 5) 验证
  tabs = await getJSON('/json/list');
  const stillAsk = tabs.find(t => t.type === 'page' && t.url.includes('ask.html'));
  console.log('confirm 页是否还在:', !!stillAsk);

  const game = tabs.find(t => t.type === 'page' && t.url.includes('start.qq.com'));
  if (game) {
    const g = await connect(game.webSocketDebuggerUrl);
    await g.send('Runtime.enable', {});
    const chk = await g.send('Runtime.evaluate', {
      expression: `{
        const tl = document.querySelector('#na-tm-watchdog-marker');
        'game page alive'
      }`,
      returnByValue: true
    });
    console.log('游戏页:', chk.result.result.value);
    g.ws.close();
  }
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
