// 验证「Input 只在标签页获得焦点后被应答」假设
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => { try { s(JSON.parse(d)); } catch (e) { j(new Error('bad')); } });
}).on('error', j));

(async () => {
  const tabs = await getJ('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('arm-game'));
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.addEventListener('message', e => { const j = JSON.parse(e.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const to = async (p, ms) => { const r = await Promise.race([p, sleep(ms).then(() => 'TIMEOUT')]); return r === 'TIMEOUT' ? null : r; };

  await to(send('Runtime.enable', {}), 3000);

  console.log('--- 焦点状态 ---');
  console.log('document.hasFocus():', JSON.stringify((await to(send('Runtime.evaluate', { expression: 'document.hasFocus()', returnByValue: true }), 3000)).result.result));
  console.log('document.hidden:', JSON.stringify((await to(send('Runtime.evaluate', { expression: 'document.hidden', returnByValue: true }), 3000)).result.result));
  console.log('visibilityState:', JSON.stringify((await to(send('Runtime.evaluate', { expression: 'document.visibilityState', returnByValue: true }), 3000)).result.result));

  console.log('\n--- 用 Target.activateTarget 激活该标签 ---');
  const t = await to(send('Target.activateTarget', { targetId: tab.id }), 3000);
  console.log('activateTarget:', t ? JSON.stringify(t.result || t.error) : '⏱ 超时');
  await sleep(1500);

  console.log('\n--- 激活后再测 Input ---');
  for (let i = 1; i <= 4; i++) {
    const r = await to(send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 100 + i, y: 200, button: 'none' }), 3000);
    console.log(`  move#${i}:`, r ? '✅ 有应答' : '⏱ 超时');
    await sleep(400);
  }
  console.log('\n激活后 hasFocus():', JSON.stringify((await to(send('Runtime.evaluate', { expression: 'document.hasFocus()', returnByValue: true }), 3000)).result.result));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
