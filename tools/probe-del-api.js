// 探查 TM 页面上可用的删除入口（onclick / 全局函数）
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => { try { s(JSON.parse(d)); } catch (e) { j(new Error('bad')); } });
}).on('error', j));

const TRASH = '#i_dW5rbm93bl8wMWUxNGMxNi0yMjJjLTQ0ODMtOTgxZS0zYTg4NjhlNDNiNmY_delete';

(async () => {
  const tabs = await getJ('/json/list');
  const tm = tabs.find(t => t.type === 'page' && t.url.includes('gcalenpjmijncebpfijmoaglllgpjagf') && t.url.includes('options'));
  const ws = new WebSocket(tm.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', e => { const j = JSON.parse(e.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});
  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return 'EXC:' + JSON.stringify(r.result.exceptionDetails).slice(0, 150);
    return r.result.result.value;
  };

  console.log('垃圾桶的 onclick/属性:', await ev(`(function(){
    const t=document.querySelector('${TRASH}');
    return JSON.stringify({
      onclick: typeof t.onclick, 
      attrs: [...t.attributes].map(a=>a.name+'='+a.value.slice(0,50)),
      parentOnclick: typeof t.parentElement.onclick,
    });
  })()`));

  console.log('\n相关全局函数:', await ev(`JSON.stringify(Object.keys(window).filter(k=>/del|remove|delete|script/i.test(k)).slice(0,25))`));

  console.log('\n行内所有可点元素:', await ev(`(function(){
    const t=document.querySelector('${TRASH}');
    const row=t.closest('tr');
    return JSON.stringify([...row.querySelectorAll('*')].filter(e=>e.onclick||e.getAttribute('onclick')||/clickable/.test(e.className||'')).map(e=>({
      tag:e.tagName, id:(e.id||'').slice(0,40), cls:(typeof e.className==='string'?e.className:'').slice(0,40),
      oc:(e.getAttribute('onclick')||'').slice(0,70)
    })).slice(0,10));
  })()`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
