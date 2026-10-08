// 抓取游戏页上所有 TM 注入的脚本源码，找出 0.6.47 从哪来
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

  console.log('=== 页面里所有含 "火影自动化 v" 的 script 标签 ===');
  console.log(await ev(`JSON.stringify([...document.querySelectorAll('script')].map((s,i)=>{
    const t=s.textContent||'';
    if(!/火影自动化/.test(t)) return null;
    const vs=[...t.matchAll(/0\\.6\\.\\d+/g)].map(m=>m[0]);
    return {i, len:t.length, src:s.src||'(inline)', vers:[...new Set(vs)].slice(0,6)};
  }).filter(Boolean), null, 1)`));

  console.log('\n=== 面板里的「设置」按钮是否两份都可点（DOM 是否真重复）===');
  console.log(await ev(`JSON.stringify([...document.querySelectorAll('#na-panel')].map((p,i)=>({
    i, ver:(p.textContent.match(/v([\\d.]+)/)||[])[1],
    btns:p.querySelectorAll('button').length,
    parent:p.parentElement?p.parentElement.tagName:'?'
  })))`));

  console.log('\n=== TM 相关全局 ===');
  console.log(await ev(`JSON.stringify(Object.keys(window).filter(k=>/tamper|TM|GM_/i.test(k)).slice(0,10))`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
