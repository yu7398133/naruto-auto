// 直接测 Input 域：不同坐标、不同命令，看哪些能被应答
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => { try { s(JSON.parse(d)); } catch (e) { j(new Error('bad')); } });
}).on('error', j));

(async () => {
  const tabs = await getJ('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('arm-game'));
  console.log('目标页:', (tab.title || '').slice(0, 30));
  console.log('webSocketDebuggerUrl:', tab.webSocketDebuggerUrl);

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.addEventListener('message', e => {
    const j = JSON.parse(e.data);
    if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); }
  });
  await new Promise(r => ws.addEventListener('open', r));
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const to = async (p, ms, what) => {
    const r = await Promise.race([p, sleep(ms).then(() => 'TIMEOUT')]);
    console.log(`  ${what}: ${r === 'TIMEOUT' ? '⏱ 超时' : JSON.stringify(r.result || r.error).slice(0, 90)}`);
    return r;
  };

  console.log('\n--- 1. Runtime.evaluate（对照）---');
  await to(send('Runtime.evaluate', { expression: '1+1', returnByValue: true }), 3000, 'evaluate');

  console.log('\n--- 2. Input 域探测：不存在的命令看域是否已存在 ---');
  await to(send('Input.enable', {}), 3000, 'Input.enable');

  console.log('\n--- 3. 各坐标 mouseMoved ---');
  for (const [x, y] of [[-1, -1], [0, 0], [500, 300], [36, 126]]) {
    await to(send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' }), 3000, `move(${x},${y})`);
  }

  console.log('\n--- 4. 其他 Input 命令 ---');
  await to(send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 65 }), 3000, 'dispatchKeyEvent');

  console.log('\n--- 5. 再试一次 mouseMoved（若域已附着应能应答）---');
  await to(send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 100, y: 100, button: 'none' }), 3000, 'move(100,100)');
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
