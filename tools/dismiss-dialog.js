// 处理 TM 页面挂起的原生 confirm 对话框，并检查删除结果
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => s(JSON.parse(d)));
}).on('error', j));

(async () => {
  const tabs = await getJ('/json/list');
  console.log('页面数:', tabs.filter(t => t.type === 'page').length);
  for (const t of tabs.filter(x => x.type === 'page')) {
    console.log('  -', (t.title || '').slice(0, 35), '|', t.url.slice(0, 55));
  }
  const tm = tabs.find(t => t.type === 'page' && t.url.includes('gcalenpjmijncebpfijmoaglllgpjagf'));
  if (!tm) { console.log('TM 页没了'); return; }

  const ws = new WebSocket(tm.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', e => { const j = JSON.parse(e.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));

  const to = (p, ms, w) => Promise.race([p, new Promise((_, rj) => setTimeout(() => rj(new Error('超时:' + w)), ms))]);
  try { console.log('Page.enable:', JSON.stringify((await to(send('Page.enable', {}), 3000, 'en')).result)); } catch (e) { console.log('Page.enable', e.message); }

  // 反复接受对话框
  for (let i = 0; i < 3; i++) {
    try {
      const r = await to(send('Page.handleJavaScriptDialog', { accept: true }), 3000, 'dlg');
      console.log('处理对话框:', JSON.stringify(r.result || r.error));
      break;
    } catch (e) { console.log('对话框尝试', i, e.message); await sleep(500); }
  }
  await sleep(800);

  try {
    const r = await to(send('Runtime.evaluate', {
      expression: `JSON.stringify({
        watchdog: [...document.querySelectorAll('tr')].some(x=>/火影后台保活看门狗/.test(x.textContent||'')),
        main: [...document.querySelectorAll('tr')].some(x=>/火影忍者云游戏自动化/.test(x.textContent||'')),
        total: document.querySelectorAll('tr[id^=tr_]').length
      })`, returnByValue: true,
    }), 5000, 'eval');
    console.log('结果:', r.result.result.value);
  } catch (e) { console.log('evaluate 失败:', e.message); }
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
