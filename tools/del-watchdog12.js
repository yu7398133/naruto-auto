// 直接调用垃圾桶元素的 onclick 处理函数
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
  ws.addEventListener('message', e => {
    const j = JSON.parse(e.data);
    if (j.method === 'Page.javascriptDialogOpening') {
      console.log('  ⚠ 原生确认框:', (j.params.message || '').slice(0, 70), '→ 接受');
      send('Page.handleJavaScriptDialog', { accept: true });
    }
    if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); }
  });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Page.enable', {});
  await send('Runtime.enable', {});
  const ev = async (e, aw) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: !!aw, userGesture: true });
    if (r.result && r.result.exceptionDetails) return 'EXC:' + JSON.stringify(r.result.exceptionDetails).slice(0, 150);
    return r.result.result.value;
  };

  console.log('调 onclick 前，看门狗存在:', await ev(`[...document.querySelectorAll('tr')].some(r=>/火影后台保活看门狗/.test(r.textContent||''))`));

  const r = await ev(`(function(){
    const t=document.querySelector('${TRASH}');
    if(!t||!t.onclick) return 'no-handler';
    try { const v = t.onclick(new MouseEvent('click',{bubbles:true})); return 'called, ret='+String(v); }
    catch(e){ return 'threw: '+e.message; }
  })()`);
  console.log('调用 onclick:', r);
  await sleep(2500);

  console.log('\n结果:');
  console.log('  看门狗存在:', await ev(`[...document.querySelectorAll('tr')].some(r=>/火影后台保活看门狗/.test(r.textContent||''))`));
  console.log('  主脚本存在:', await ev(`[...document.querySelectorAll('tr')].some(r=>/火影忍者云游戏自动化/.test(r.textContent||''))`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
