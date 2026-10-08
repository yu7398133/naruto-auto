// 权威检查：当前页面有几个面板，各自从哪个脚本实例来的
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
  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return 'EXC';
    return r.result.result.value;
  };

  console.log('### 刚打开时的状态 ###');
  console.log('na-panel 数:', await ev(`document.querySelectorAll('#na-panel').length`));
  console.log('na-fab 数:', await ev(`document.querySelectorAll('#na-fab').length`));
  console.log('各面板版本:', await ev(`JSON.stringify([...document.querySelectorAll('#na-panel')].map(p=>(p.textContent.match(/v([\\d.]+)/)||[])[1]))`));

  console.log('\n### 删除所有面板，等 8 秒看谁会重新出现 ###');
  console.log('删除:', await ev(`(function(){let n=0;document.querySelectorAll('#na-panel,#na-fab').forEach(e=>{e.remove();n++});return n})()`));
  await sleep(8000);
  console.log('8 秒后 na-panel 数:', await ev(`document.querySelectorAll('#na-panel').length`));
  console.log('8 秒后各面板版本:', await ev(`JSON.stringify([...document.querySelectorAll('#na-panel')].map(p=>(p.textContent.match(/v([\\d.]+)/)||[])[1]))`));

  console.log('\n### 再等 8 秒 ###');
  await sleep(8000);
  console.log('16 秒后 na-panel 数:', await ev(`document.querySelectorAll('#na-panel').length`));
  console.log('16 秒后各面板版本:', await ev(`JSON.stringify([...document.querySelectorAll('#na-panel')].map(p=>(p.textContent.match(/v([\\d.]+)/)||[])[1]))`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
