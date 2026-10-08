// 决定性实验：删掉 0.6.47 面板 -> 硬重载 -> 看它是否复活
// 复活 = 有东西在重新注入它；不复活 = 它只是残留在当前 document 里的旧节点
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => { try { s(JSON.parse(d)); } catch (e) { j(new Error('bad')); } });
}).on('error', j));

async function conn(match) {
  const tabs = await getJ('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes(match));
  if (!tab) throw new Error('没找到 ' + match);
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
  return { ws, send, ev };
}

const ST = `JSON.stringify({panel:document.querySelectorAll('#na-panel').length,vers:[...document.querySelectorAll('#na-panel')].map(p=>(p.textContent.match(/v([\\d.]+)/)||[])[1]),nav:performance.getEntriesByType('navigation').length})`;

(async () => {
  const g = await conn('arm-game');
  console.log('BEFORE :', await g.ev(ST));

  console.log('\n>>> 只删掉 0.6.47 的那一份');
  console.log('删除数:', await g.ev(`(function(){let n=0;
    for(const el of document.querySelectorAll('#na-panel,#na-fab')){
      const v=(el.textContent.match(/v([\\d.]+)/)||[])[1];
      if(el.id==='na-fab' || v==='0.6.47'){ el.remove(); n++; }
    }
    return n})()`));
  console.log('删除后:', await g.ev(ST));

  console.log('\n>>> 硬重载');
  await g.send('Page.enable', {});
  await g.send('Page.reload', { ignoreCache: true });
  await sleep(16000);
  console.log('重载后:', await g.ev(ST));
  g.ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
