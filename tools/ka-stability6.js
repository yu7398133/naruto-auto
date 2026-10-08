// 后台标签页下连续 6 轮保活稳定性测试
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
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', e => { const j = JSON.parse(e.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});
  const ev = async (e, aw) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: !!aw });
    if (r.result && r.result.exceptionDetails) return 'EXC';
    return r.result.result.value;
  };

  console.log('可见性:', await ev('document.visibilityState'), ' video rs:', await ev(`(function(){const v=document.querySelector('video');return v?v.readyState:-1})()`));
  console.log('');

  let pass = 0;
  for (let i = 1; i <= 6; i++) {
    const r = await ev(`(async()=>{try{return await __narutoAuto.keepAlive()}catch(e){return 'ERR:'+e.message}})()`, true);
    await sleep(600);
    const v = await ev(`(function(){const v=document.querySelector('video');return v?v.readyState:-1})()`);
    const menuOpen = await ev(`(function(){const b=document.querySelector('.setting-box');return !!(b&&/focus/.test(b.className))})()`);
    const ok = r === true && v >= 2 && menuOpen === false;
    if (ok) pass++;
    console.log(`第 ${i} 轮: 返回=${r}  video=${v}  菜单残留=${menuOpen}  ${ok ? 'OK' : 'FAIL'}`);
    await sleep(700);
  }
  console.log(`\n结果: ${pass}/6 通过`);
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
