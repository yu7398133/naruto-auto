// 用 CDP 真实点击下拉+选项，再点 TM 自己的「应用」按钮
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
  await Promise.race([send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: -1, y: -1, button: 'none' }), sleep(700)]);
  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return 'EXC';
    return r.result.result.value;
  };
  const clickAt = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    await sleep(80);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(60);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(400);
  };
  const centerOf = async (sel) => {
    const s = await ev(`(function(){const e=document.querySelector('${sel}');if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});})()`);
    return s ? JSON.parse(s) : null;
  };

  // 只勾看门狗
  await ev(`document.querySelectorAll('input[type=checkbox]').forEach(c=>{if(c.checked){c.checked=false;c.dispatchEvent(new Event('change',{bubbles:true}));}})`);
  await sleep(500);
  await ev(`(function(){const t=document.querySelector('${TRASH}');const cb=t.closest('tr').querySelector('input[type=checkbox]');cb.click();return cb.checked;})()`);
  await sleep(500);
  console.log('已勾选数:', await ev(`document.querySelectorAll('input[type=checkbox]:checked').length`));
  const who = await ev(`(function(){const cs=[...document.querySelectorAll('input[type=checkbox]:checked')];return cs.length===1?(cs[0].closest('tr').querySelector('td:nth-child(4),.script_name')||{}).textContent:'';})()`);
  console.log('勾选的是:', (who || '').slice(0, 30));

  // 真实点击下拉框
  const sp = await centerOf(SEL);
  console.log('下拉位置:', JSON.stringify(sp));
  await clickAt(sp.x, sp.y);
  await sleep(700);
  // 选「删除」选项
  const opt = await ev(`(function(){
    const s=document.querySelector('${SEL}');
    const o=[...s.options].find(x=>/^删除$/.test(x.textContent.trim()));
    if(!o)return null;
    s.value=o.value;
    s.dispatchEvent(new Event('change',{bubbles:true}));
    return s.options[s.selectedIndex].textContent.trim();
  })()`);
  console.log('下拉值:', opt);
  await sleep(1500);

  // 打印当前可见按钮，找「应用」
  console.log('可见按钮:', await ev(`JSON.stringify([...document.querySelectorAll('button,a,input[type=button]')].filter(b=>b.offsetParent).map(b=>(b.textContent||b.value||b.id||'').trim().slice(0,16)).filter(Boolean).slice(-14))`));

  const applied = await ev(`(function(){
    const bs=[...document.querySelectorAll('button,a,input[type=button]')].filter(b=>b.offsetParent);
    const b=bs.find(x=>/应用|确定|执行|删除|OK/i.test((x.textContent||x.value||'').trim()));
    if(!b)return 'no-btn';
    b.click();
    return 'clicked:'+(b.textContent||b.value).trim();
  })()`);
  console.log('应用:', applied);
  await sleep(2500);

  console.log('\n结果:');
  console.log('  看门狗:', await ev(`[...document.querySelectorAll('tr')].some(r=>/火影后台保活看门狗/.test(r.textContent||'')) ? '❌ 仍在' : '✅ 已删除'`));
  console.log('  主脚本:', await ev(`[...document.querySelectorAll('tr')].some(r=>/火影忍者云游戏自动化/.test(r.textContent||'')) ? '✅ 仍在' : '❌ 被误删'`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
