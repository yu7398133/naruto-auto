// 检查页面实际加载的脚本版本与 API 集
const http = require('http');
const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});

(async () => {
  const tabs = await getJSON('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('arm-game'));
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', ev => { const j = JSON.parse(ev.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});
  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return 'EXC';
    return r.result.result.value;
  };

  console.log('__narutoAuto 的 key:');
  console.log(await ev('JSON.stringify(Object.keys(window.__narutoAuto).sort())'));
  console.log('\nka* 相关:');
  console.log(await ev('JSON.stringify(Object.keys(window.__narutoAuto).filter(k=>/^ka/i.test(k)))'));
  console.log('\npopupLog:', await ev('typeof (window.__narutoAuto&&window.__narutoAuto.popupLog)'));
  console.log('menu   :', await ev('typeof (window.__narutoAuto&&window.__narutoAuto.menu)'));
  console.log('keepAlive:', await ev('typeof (window.__narutoAuto&&window.__narutoAuto.keepAlive)'));
  console.log('\n面板标题:', await ev(`(function(){
    const els=[...document.querySelectorAll('div')].filter(e=>/火影自动化\\s*v\\d/.test(e.textContent||''));
    return els.length?els[0].textContent.trim().slice(0,60):'(未找到)';})()`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
