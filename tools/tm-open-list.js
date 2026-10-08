// 打开 TM 管理页并列出所有火影相关脚本（含隐藏/禁用）
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => { try { s(JSON.parse(d)); } catch (e) { j(new Error('bad')); } });
}).on('error', j));

(async () => {
  const r = await getJ('/json/new?chrome-extension://gcalenpjmijncebpfijmoaglllgpjagf/options.html%23nav=scripts');
  console.log('新标签:', (r.id || '').slice(0, 16), r.url ? r.url.slice(0, 70) : '');
  await sleep(4000);
  const tabs = await getJ('/json/list');
  const tm = tabs.find(t => t.id === r.id) || tabs.find(t => t.url.includes('gcalenpjmijncebpfijmoaglllgpjagf') && t.url.includes('options'));
  if (!tm) { console.log('无 TM 页'); return; }
  const ws = new WebSocket(tm.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(rr => { const i = ++id; pend.set(i, rr); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', e => { const j = JSON.parse(e.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(rr => ws.addEventListener('open', rr));
  await send('Runtime.enable', {});
  await sleep(3000);
  const ev = async (e) => {
    const rr = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (rr.result && rr.result.exceptionDetails) return 'EXC';
    return rr.result.result.value;
  };
  console.log('页面:', await ev('document.title'));
  console.log('总行数:', await ev(`document.querySelectorAll('tr[id^=tr_]').length`));
  console.log('\n火影相关行:');
  console.log(await ev(`JSON.stringify([...document.querySelectorAll('tr[id^=tr_]')].map(tr=>{
    const t=tr.textContent.replace(/\\s+/g,' ').trim();
    if(!/火影|naruto/i.test(t)) return null;
    const n=tr.querySelector('.script_name');
    const cb=tr.querySelector('input[type=checkbox]');
    return {name:(n?n.textContent.trim().split('\\n')[0]:'?').slice(0,26), text:t.slice(0,70), cbId:(cb&&cb.id||'').slice(0,44)};
  }).filter(Boolean), null, 1)`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
