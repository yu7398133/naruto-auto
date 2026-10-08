// 关闭多余的 TM 标签页，只留游戏页；并重载 TM 管理页解冻
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => s(JSON.parse(d)));
}).on('error', j));

const TMID = 'gcalenpjmijncebpfijmoaglllgpjagf';

(async () => {
  const tabs = (await getJ('/json/list')).filter(t => t.type === 'page');
  console.log('当前页面:');
  tabs.forEach(t => console.log('  ', (t.title || '?').slice(0, 30), '|', t.url.slice(0, 60)));

  // 关掉所有 TM 内部页（ask/options/off 等），保留一个 options 页稍后重载
  const tmTabs = tabs.filter(t => t.url.includes(TMID));
  let kept = null;
  for (const t of tmTabs) {
    if (t.url.includes('/options') && !kept) { kept = t; continue; }
    try {
      await getJ('/json/close/' + t.id);
      console.log('  已关闭:', t.url.slice(0, 55));
    } catch (e) { console.log('  关闭失败:', t.url.slice(0, 40), e.message); }
    await sleep(300);
  }

  if (kept) {
    console.log('\n重载保留下来的 TM 页…');
    const ws = new WebSocket(kept.webSocketDebuggerUrl);
    let id = 0; const pend = new Map();
    const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
    ws.addEventListener('message', e => { const j = JSON.parse(e.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
    await new Promise(r => ws.addEventListener('open', r));
    try {
      await Promise.race([send('Page.reload', { ignoreCache: true }), sleep(3000)]);
      console.log('  已发送重载');
    } catch (e) { console.log('  重载失败:', e.message); }
    ws.close();
  }
  await sleep(5000);
  const after = (await getJ('/json/list')).filter(t => t.type === 'page');
  console.log('\n处理后页面数:', after.length);
  after.forEach(t => console.log('  ', (t.title || '?').slice(0, 30), '|', t.url.slice(0, 55)));
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
