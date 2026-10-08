// 找出两份脚本各自的来源：检查 TM 注入了几个 <script>，以及各自的内容版本
const http = require('http');
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

  console.log('=== 内联 script 里含 VERSION 的 ===');
  console.log(await ev(`JSON.stringify([...document.querySelectorAll('script')].map((s,i)=>{
    const t=s.textContent||'';
    const m=t.match(/const VERSION = '([\\d.]+)'/);
    return m?{idx:i, ver:m[1], len:t.length, head:(s.getAttribute('data-require')||s.getAttribute('src')||'').slice(0,40)}:null;
  }).filter(Boolean))`));

  console.log('\n=== 两个 #na-panel 的版本 ===');
  console.log(await ev(`JSON.stringify([...document.querySelectorAll('#na-panel')].map((p,i)=>({
    i, ver:(p.textContent.match(/v([\\d.]+)/)||[])[1],
    fab:(document.querySelectorAll('#na-fab')[i]||{}).textContent,
    display:getComputedStyle(p).display, rect:(r=>({x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}))(p.getBoundingClientRect())
  })))`));

  console.log('\n=== __narutoAuto 版本（活跃实例）===');
  console.log(await ev(`(function(){try{return __narutoAuto.diag&&__narutoAuto.diag.version?__narutoAuto.diag.version:'(无 diag.version)'}catch(e){return 'EXC'}})()`));
  console.log('全局键含 naruto 的:', await ev(`JSON.stringify(Object.keys(window).filter(k=>/naruto/i.test(k)))`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
