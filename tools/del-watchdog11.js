// 直接点垃圾桶图标删除看门狗（真实 CDP 点击 + 处理确认）
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => { try { s(JSON.parse(d)); } catch (e) { j(new Error('bad json: ' + d.slice(0, 40))); } });
}).on('error', j));

const TRASH = '#i_dW5rbm93bl8wMWUxNGMxNi0yMjJjLTQ0ODMtOTgxZS0zYTg4NjhlNDNiNmY_delete';

(async () => {
  const tabs = await getJ('/json/list');
  const tm = tabs.find(t => t.type === 'page' && t.url.includes('gcalenpjmijncebpfijmoaglllgpjagf') && t.url.includes('options'));
  if (!tm) { console.log('没找到 TM 管理页'); process.exit(1); }
  const ws = new WebSocket(tm.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', e => {
    const j = JSON.parse(e.data);
    if (j.method === 'Page.javascriptDialogOpening') {
      console.log('  ⚠ 原生对话框:', (j.params.message || '').slice(0, 60));
      send('Page.handleJavaScriptDialog', { accept: true });
    }
    if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); }
  });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Page.enable', {});
  await send('Runtime.enable', {});
  // 热身
  await Promise.race([send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: -1, y: -1, button: 'none' }), sleep(600)]);

  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return 'EXC';
    return r.result.result.value;
  };

  // 通过 TM 自己的内部函数删除（行内垃圾桶的 onclick）
  console.log('垃圾桶元素信息:', await ev(`(function(){
    const t=document.querySelector('${TRASH}');
    if(!t) return 'not-found';
    const r=t.getBoundingClientRect();
    return JSON.stringify({x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2), w:r.width, h:r.height, vis:!!t.offsetParent});
  })()`));

  const posStr = await ev(`(function(){
    const t=document.querySelector('${TRASH}');
    t.scrollIntoView({block:'center'});
    const r=t.getBoundingClientRect();
    return JSON.stringify({x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)});
  })()`);
  const { x, y } = JSON.parse(posStr);
  console.log('点击坐标:', x, y);

  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
  await sleep(100);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await sleep(70);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(2500);

  console.log('\n结果:');
  console.log('  看门狗:', await ev(`[...document.querySelectorAll('tr')].some(r=>/火影后台保活看门狗/.test(r.textContent||'')) ? '❌ 仍在' : '✅ 已删除'`));
  console.log('  主脚本:', await ev(`[...document.querySelectorAll('tr')].some(r=>/火影忍者云游戏自动化/.test(r.textContent||'')) ? '✅ 仍在' : '❌ 被误删'`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
