// 通过批量操作下拉删除看门狗
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => s(JSON.parse(d)));
}).on('error', j));

const SEL = '#select_c2VsZWN0X3Ntcy1zZWxlY3R1bmRlZmluZWQ_dd';

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

  // 1. 确认只有看门狗被勾选
  console.log('已勾选脚本数:', await ev(`document.querySelectorAll('input[type=checkbox]:checked').length`));
  console.log('勾选的是:', await ev(`JSON.stringify([...document.querySelectorAll('input[type=checkbox]:checked')].map(c=>{const tr=c.closest('tr');return tr?tr.textContent.trim().replace(/\\s+/g,' ').slice(0,24):'?'}))`));

  // 2. 选「删除」
  console.log('\n设置下拉为「删除」:', await ev(`(function(){
    const s=document.querySelector('${SEL}');
    const opt=[...s.options].find(o=>/^删除$/.test(o.textContent.trim()));
    if(!opt) return 'no-opt';
    s.value=opt.value;
    s.dispatchEvent(new Event('change',{bubbles:true}));
    return 'set to '+opt.textContent.trim();
  })()`));
  await sleep(1500);

  // 3. 看是否有二次确认
  const dlg = await ev(`(function(){
    const vis=[...document.querySelectorAll('div')].filter(e=>e.offsetParent && /确定|确认|真的要|不可撤销/i.test(e.textContent||'') && e.textContent.length<200);
    return vis.length? vis[vis.length-1].textContent.trim().replace(/\\s+/g,' ').slice(0,100) : 'no-dialog';
  })()`);
  console.log('对话框:', dlg);

  const conf = await ev(`(function(){
    const btns=[...document.querySelectorAll('button,input[type=button],a')].filter(b=>b.offsetParent);
    const b=btns.find(x=>/^(确定|是|删除|OK|Yes)$/i.test((x.textContent||x.value||'').trim()));
    if(b){b.click();return 'clicked:'+(b.textContent||b.value).trim();}
    return 'no-confirm';
  })()`);
  console.log('确认点击:', conf);
  await sleep(2500);

  console.log('\n结果:');
  console.log('  看门狗:', await ev(`[...document.querySelectorAll('tr')].some(r=>/火影后台保活看门狗/.test(r.textContent||'')) ? '❌ 仍在' : '✅ 已删除'`));
  console.log('  主脚本:', await ev(`[...document.querySelectorAll('tr')].some(r=>/火影忍者云游戏自动化/.test(r.textContent||'')) ? '✅ 仍在' : '❌ 被误删'`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
