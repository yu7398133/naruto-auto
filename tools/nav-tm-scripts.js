// 把 TM 管理页导航到「已安装脚本」列表并删除看门狗
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
  ws.addEventListener('message', e => {
    const j = JSON.parse(e.data);
    if (j.method === 'Page.javascriptDialogOpening') {
      console.log('  ⚠ 原生确认框:', (j.params.message || '').slice(0, 70));
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
  const clickAt = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    await sleep(90);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(70);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(700);
  };

  // 导航到已安装脚本列表
  await send('Page.navigate', { url: 'chrome-extension://gcalenpjmijncebpfijmoaglllgpjagf/options.html#nav=scripts' });
  await sleep(5000);
  console.log('页面标题:', await ev('document.title'));
  console.log('脚本行数:', await ev(`document.querySelectorAll('tr[id^=tr_]').length`));

  const rows = await ev(`JSON.stringify([...document.querySelectorAll('tr[id^=tr_]')].map(tr=>{
    const n=tr.querySelector('.script_name');
    return n?n.textContent.trim().split('\\n')[0].slice(0,28):null;
  }).filter(Boolean))`);
  console.log('脚本列表:', rows);
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
