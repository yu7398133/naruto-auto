// 诊断：页面上到底有几个面板 / 几份脚本实例
const http = require('http');
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => { try { s(JSON.parse(d)); } catch (e) { j(new Error('bad')); } });
}).on('error', j));

(async () => {
  const tabs = await getJ('/json/list');
  console.log('=== 所有标签页 ===');
  tabs.filter(t => t.type === 'page').forEach(t => console.log('  ' + (t.title || '?').slice(0, 34) + ' | ' + t.url.slice(0, 62)));

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

  console.log('\n=== 面板元素 ===');
  console.log('含「火影自动化」的元素数:', await ev(`[...document.querySelectorAll('*')].filter(e=>/火影自动化\\s*v[\\d.]+/.test(e.textContent||'')).length`));
  console.log('各面板文字:', await ev(`JSON.stringify([...document.querySelectorAll('*')].filter(e=>/火影自动化\\s*v[\\d.]+/.test(e.textContent||'')&&e.children.length<3).map(e=>e.textContent.trim().slice(0,40)))`));
  console.log('\nshadowRoot 数量:', await ev(`[...document.querySelectorAll('*')].filter(e=>e.shadowRoot).length`));
  console.log('顶层注入容器:', await ev(`JSON.stringify([...document.body.children].map(e=>e.tagName+'#'+(e.id||'')+'.'+(typeof e.className==='string'?e.className:'')).slice(0,20))`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
