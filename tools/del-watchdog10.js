// 勾选看门狗 → 下拉选删除 → 点 action_button
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => s(JSON.parse(d)));
}).on('error', j));

const SEL = '#select_c2VsZWN0X3Ntcy1zZWxlY3R1bmRlZmluZWQ_dd';
const BTN = '#input_TXVsdGlTZWxlY3RCdXR0b25fc3RhcnRfYnV0dG9u_bu';
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
    if (r.result && r.result.exceptionDetails) return 'EXC';
    return r.result.result.value;
  };

  // 只留看门狗一个勾选
  await ev(`document.querySelectorAll('input[type=checkbox]').forEach(c=>{if(c.checked){c.checked=false;c.dispatchEvent(new Event('change',{bubbles:true}));}})`);
  await sleep(400);
  await ev(`(function(){const t=document.querySelector('${TRASH}');const cb=t.closest('tr').querySelector('input[type=checkbox]');cb.click();})()`);
  await sleep(600);
  const n = await ev(`document.querySelectorAll('input[type=checkbox]:checked').length`);
  console.log('勾选数:', n);
  if (n !== 1) { console.log('中止'); ws.close(); return; }

  await ev(`(function(){const s=document.querySelector('${SEL}');const o=[...s.options].find(x=>/^删除$/.test(x.textContent.trim()));s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await sleep(900);
  console.log('下拉值:', await ev(`document.querySelector('${SEL}').options[document.querySelector('${SEL}').selectedIndex].textContent.trim()`));

  // 点应用按钮（先 scrollIntoView）
  const r = await ev(`(function(){const b=document.querySelector('${BTN}');if(!b)return 'no-btn';b.scrollIntoView({block:'center'});b.click();return 'clicked';})()`);
  console.log('应用按钮:', r);
  await sleep(2000);

  // 可能弹确认
  const conf = await ev(`(function(){
    const bs=[...document.querySelectorAll('button,input[type=button]')].filter(b=>b.offsetParent && b.id!=='${BTN.slice(1)}');
    const b=bs.find(x=>/^(确定|是|删除|OK|Yes)$/i.test((x.value||x.textContent||'').trim()));
    if(b){b.click();return 'clicked:'+(b.value||b.textContent).trim();}
    return 'no-confirm-needed';
  })()`);
  console.log('确认:', conf);
  await sleep(2500);

  console.log('\n结果:');
  console.log('  看门狗:', await ev(`[...document.querySelectorAll('tr')].some(r=>/火影后台保活看门狗/.test(r.textContent||'')) ? '❌ 仍在' : '✅ 已删除'`));
  console.log('  主脚本:', await ev(`[...document.querySelectorAll('tr')].some(r=>/火影忍者云游戏自动化/.test(r.textContent||'')) ? '✅ 仍在' : '❌ 被误删'`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
