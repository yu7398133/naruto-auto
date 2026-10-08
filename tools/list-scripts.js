// 检查 TM 页面脚本列表当前状态（简洁输出）
const http = require('http');
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => { try { s(JSON.parse(d)); } catch (e) { j(new Error('bad')); } });
}).on('error', j));

(async () => {
  const tabs = await getJ('/json/list');
  const all = tabs.filter(t => t.type === 'page');
  console.log('页面清单:');
  for (const t of all) console.log('  ' + (t.title || '?').slice(0, 32) + ' | ' + t.url.slice(0, 58));

  const tm = all.find(t => t.url.includes('gcalenpjmijncebpfijmoaglllgpjagf') && t.url.includes('options'));
  if (!tm) { console.log('\n(无 TM 管理页)'); return; }
  const ws = new WebSocket(tm.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', e => { const j = JSON.parse(e.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});
  const r = await send('Runtime.evaluate', {
    expression: `JSON.stringify([...document.querySelectorAll('tr[id^=tr_]')].map(tr=>{
      const n=tr.querySelector('.script_name,td:nth-child(4)');
      return n?n.textContent.trim().split('\\n')[0].slice(0,30):'?';
    }))`, returnByValue: true,
  });
  console.log('\nTM 脚本列表:', r.result.result.value);
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
