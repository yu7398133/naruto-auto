// 列表已加载 → 点看门狗行的垃圾桶 → 处理确认
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => { try { s(JSON.parse(d)); } catch (e) { j(new Error('bad')); } });
}).on('error', j));

(async () => {
  const tabs = await getJ('/json/list');
  const tm = tabs.find(t => t.type === 'page' && t.url.includes('gcalenpjmijncebpfijmoaglllgpjagf') && t.url.includes('options'));
  const ws = new WebSocket(tm.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  let dialogSeen = false;
  ws.addEventListener('message', e => {
    const j = JSON.parse(e.data);
    if (j.method === 'Page.javascriptDialogOpening') {
      dialogSeen = true;
      console.log('  ⚠ 原生确认框:', (j.params.message || '').slice(0, 80));
      send('Page.handleJavaScriptDialog', { accept: true });
    }
    if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); }
  });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Page.enable', {});
  await send('Runtime.enable', {});
  await Promise.race([send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: -1, y: -1, button: 'none' }), sleep(600)]);

  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return 'EXC';
    return r.result.result.value;
  };

  // 找看门狗行的垃圾桶并滚动到可见处
  const posStr = await ev(`(function(){
    for(const tr of document.querySelectorAll('tr[id^=tr_]')){
      const n=tr.querySelector('.script_name');
      if(!n || !/火影后台保活看门狗/.test(n.textContent)) continue;
      const icons=[...tr.querySelectorAll('i')];
      const trash=icons.find(i=>/trash/.test(i.className));
      if(!trash) return JSON.stringify({err:'no-trash', icons:icons.map(i=>i.className)});
      trash.scrollIntoView({block:'center'});
      const r=trash.getBoundingClientRect();
      return JSON.stringify({x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2), w:r.width, h:r.height});
    }
    return JSON.stringify({err:'no-row'});
  })()`);
  console.log('垃圾桶:', posStr);
  const pos = JSON.parse(posStr);
  if (pos.err) { ws.close(); return; }

  for (let i = 0; i < 2; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y, button: 'none' });
    await sleep(120);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
    await sleep(80);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
    await sleep(1500);
    const gone = await ev(`![...document.querySelectorAll('tr[id^=tr_]')].some(tr=>{const n=tr.querySelector('.script_name');return n&&/火影后台保活看门狗/.test(n.textContent);})`);
    console.log(`  第 ${i + 1} 次点击后已删除:`, gone);
    if (gone === true) break;
  }

  console.log('\n对话框是否出现:', dialogSeen);
  console.log('看门狗:', await ev(`[...document.querySelectorAll('tr[id^=tr_]')].some(tr=>{const n=tr.querySelector('.script_name');return n&&/火影后台保活看门狗/.test(n.textContent);}) ? '❌ 仍在' : '✅ 已删除'`));
  console.log('主脚本:', await ev(`[...document.querySelectorAll('tr[id^=tr_]')].some(tr=>{const n=tr.querySelector('.script_name');return n&&/火影忍者云游戏自动化/.test(n.textContent);}) ? '✅ 仍在' : '❌ 被误删'`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
