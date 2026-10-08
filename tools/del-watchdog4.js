// 用真实 CDP 点击看门狗行的垃圾桶图标并确认删除
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => s(JSON.parse(d)));
}).on('error', j));

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
  // 热身：激活 Input 域
  await Promise.race([send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: -1, y: -1, button: 'none' }), sleep(700)]);
  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return 'EXC';
    return r.result.result.value;
  };
  const clickAt = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    await sleep(90);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(60);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(500);
  };

  // 确保勾选
  await ev(`(function(){const cb=document.querySelector('${TRASH}').closest('tr').querySelector('input[type=checkbox]');if(!cb.checked){cb.click();}return cb.checked;})()`);
  console.log('勾选状态:', await ev(`document.querySelector('${TRASH}').closest('tr').querySelector('input[type=checkbox]').checked`));

  const pos = await ev(`(function(){const e=document.querySelector('${TRASH}');const r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});})()`);
  console.log('垃圾桶位置:', pos);
  const { x, y } = JSON.parse(pos);
  await clickAt(x, y);
  await sleep(1200);

  // TM 会弹确认框
  const dlg = await ev(`(function(){
    const m=[...document.querySelectorAll('div,section')].filter(e=>e.offsetParent&&/确定|确认|删除|真的要/i.test(e.textContent||'')&&e.textContent.length<300);
    return m.length? m[m.length-1].textContent.trim().slice(0,80) : 'no-dialog';
  })()`);
  console.log('对话框:', dlg);

  // 点确认
  const conf = await ev(`(function(){
    const btns=[...document.querySelectorAll('button,input[type=button],a')].filter(b=>b.offsetParent);
    const b=btns.find(x=>/^(确定|是|删除|OK|Yes)$/i.test((x.textContent||x.value||'').trim()));
    if(b){b.click();return 'clicked:'+(b.textContent||b.value).trim();}
    return 'none';
  })()`);
  console.log('确认:', conf);
  await sleep(2000);

  console.log('\n看门狗是否还在:',
    await ev(`[...document.querySelectorAll('tr')].some(r=>/火影后台保活看门狗/.test(r.textContent||'')) ? '仍在' : '✅ 已删除'`));
  console.log('主脚本是否还在:',
    await ev(`[...document.querySelectorAll('tr')].some(r=>/火影忍者云游戏自动化/.test(r.textContent||'')) ? '✅ 仍在' : '❌ 被误删'`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
