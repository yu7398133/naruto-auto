// 钩住 DOM 插入，抓出是谁把 0.6.47 面板塞进来的（含调用栈）
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
    if (r.result && r.result.exceptionDetails) return 'EXC:' + String(r.result.exceptionDetails.text).slice(0, 60);
    return r.result.result.value;
  };

  // 装钩子：记录每次插入 na-panel 的时间戳+栈
  await ev(`(function(){
    if(window.__hookOn) return 'already';
    window.__hookOn=true; window.__hookLog=[];
    const orig=Node.prototype.appendChild;
    Node.prototype.appendChild=function(c){
      try{ if(c&&c.id&&/^na-(panel|fab)$/.test(c.id)){
        const v=(c.textContent||'').match(/v([\\d.]+)/);
        window.__hookLog.push({t:Date.now(), id:c.id, ver:v?v[1]:'?', stack:(new Error().stack||'').split('\\n').slice(1,4).join(' | ').slice(0,200)});
      }}catch(e){}
      return orig.call(this,c);
    };
    return 'hooked';
  })()`);

  console.log('清空现有面板并重载...');
  await ev(`document.querySelectorAll('#na-panel,#na-fab').forEach(e=>e.remove())`);
  await send('Page.enable', {});
  await send('Page.reload', { ignoreCache: true });
  await sleep(18000);

  // 重载后钩子没了，需要重新装 —— 所以改用"重载前注入到早期"做不到。
  // 退一步：直接看重载后日志（若钩子装在 document_start 之前则无效）。
  console.log('重载后面板:', await ev(`JSON.stringify([...document.querySelectorAll('#na-panel')].map(p=>(p.textContent.match(/v([\\d.]+)/)||[])[1]))`));
  console.log('hookLog:', await ev(`JSON.stringify(window.__hookLog||'(钩子未存活)')`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
