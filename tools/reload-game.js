// 重载游戏页（CDP Page.reload 比页面内 location.reload 可靠）
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => { try { s(JSON.parse(d)); } catch (e) { j(new Error('bad')); } });
}).on('error', j));

(async () => {
  const tabs = await getJ('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('arm-game'));
  if (!tab) { console.log('没有云游戏页'); return; }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', e => { const j = JSON.parse(e.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  try { await Promise.race([send('Page.reload', { ignoreCache: true }), sleep(3000)]); console.log('已发送重载'); } catch (e) { console.log('重载失败', e.message); }
  ws.close();

  await sleep(15000);
  const tabs2 = await getJ('/json/list');
  const t2 = tabs2.find(t => t.type === 'page' && t.url.includes('arm-game'));
  const ws2 = new WebSocket(t2.webSocketDebuggerUrl);
  let id2 = 0; const pend2 = new Map();
  const send2 = (m, p) => new Promise(r => { const i = ++id2; pend2.set(i, r); ws2.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws2.addEventListener('message', e => { const j = JSON.parse(e.data); if (j.id && pend2.has(j.id)) { pend2.get(j.id)(j); pend2.delete(j.id); } });
  await new Promise(r => ws2.addEventListener('open', r));
  await send2('Runtime.enable', {});
  const ev = async (e) => {
    const r = await send2('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return 'EXC';
    return r.result.result.value;
  };
  console.log('页面标题:', await ev('document.title'));
  console.log('脚本版本:', await ev(`(function(){const p=__narutoAuto&&__narutoAuto.panel;return (p&&p.titleText)||'?'})()`));
  console.log('有 renew 自动续时代码:', await ev(`typeof __narutoAuto === 'object'`));
  ws2.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
