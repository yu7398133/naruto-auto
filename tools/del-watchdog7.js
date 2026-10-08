// 只勾选看门狗（先全部取消），再用批量操作删除
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => s(JSON.parse(d)));
}).on('error', j));

const SEL = '#select_c2VsZWN0X3Ntcy1zZWxlY3R1bmRlZmluZWQ_dd';
const TRASH = '#i_dW5rbm93bl8wMWUxNGMxNi0yMjJjLTQ0ODMtOTgxZS0zYTg4NjhlNDNiNmY_delete';

(async () => {
  const tabs = await getJ('/json/list');
  const tm = tabs.find(t => t.type === 'page' && t.url.includes('gcalenpjmijncebpfijmoaglllgpjagf'));
  const ws = new WebSocket(tm.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', e => { const j = JSON.parse(e.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});
  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return 'EXC:' + JSON.stringify(r.result.exceptionDetails).slice(0, 130);
    return r.result.result.value;
  };

  // 1. 全部取消勾选
  await ev(`(function(){
    document.querySelectorAll('input[type=checkbox]').forEach(c=>{ if(c.checked){ c.checked=false; c.dispatchEvent(new Event('change',{bubbles:true})); } });
    return 'cleared';
  })()`);
  await sleep(600);
  console.log('清空后已勾选:', await ev(`document.querySelectorAll('input[type=checkbox]:checked').length`));

  // 2. 只勾看门狗那一行
  const r2 = await ev(`(function(){
    const trash=document.querySelector('${TRASH}');
    if(!trash) return 'no-trash';
    const row=trash.closest('tr');
    const cb=row.querySelector('input[type=checkbox]');
    if(!cb) return 'no-cb';
    cb.checked=true;
    cb.dispatchEvent(new Event('change',{bubbles:true}));
    return 'checked';
  })()`);
  await sleep(600);
  console.log('勾选操作:', r2);
  console.log('已勾选:', await ev(`document.querySelectorAll('input[type=checkbox]:checked').length`));
  console.log('勾选的是:', await ev(`JSON.stringify([...document.querySelectorAll('input[type=checkbox]:checked')].map(c=>{const tr=c.closest('tr');return tr?tr.textContent.trim().replace(/\\s+/g,' ').slice(0,22):'?'})`));

  const n = await ev(`document.querySelectorAll('input[type=checkbox]:checked').length`);
  if (n !== 1) { console.log('\n⚠ 勾选数不为 1，中止以免误删'); ws.close(); return; }

  // 3. 选「删除」
  await ev(`(function(){
    const s=document.querySelector('${SEL}');
    const o=[...s.options].find(x=>/^删除$/.test(x.textContent.trim()));
    s.value=o.value; s.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  await sleep(1800);

  const conf = await ev(`(function(){
    const btns=[...document.querySelectorAll('button,input[type=button],a')].filter(b=>b.offsetParent);
    const b=btns.find(x=>/^(确定|是|删除|OK|Yes)$/i.test((x.textContent||x.value||'').trim()));
    if(b){b.click();return 'clicked:'+(b.textContent||b.value).trim();}
    return 'no-confirm';
  })()`);
  console.log('确认:', conf);
  await sleep(2500);

  console.log('\n结果:');
  console.log('  看门狗:', await ev(`[...document.querySelectorAll('tr')].some(r=>/火影后台保活看门狗/.test(r.textContent||'')) ? '❌ 仍在' : '✅ 已删除'`));
  console.log('  主脚本:', await ev(`[...document.querySelectorAll('tr')].some(r=>/火影忍者云游戏自动化/.test(r.textContent||'')) ? '✅ 仍在' : '❌ 被误删'`));
  console.log('  脚本总数:', await ev(`document.querySelectorAll('tr[id^=tr_]').length`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
