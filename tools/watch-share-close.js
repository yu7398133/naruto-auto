// 轮询等待 .share-wrap 出现 → 观察看门狗是否自动关闭 → 报告时间线
(async () => {
  const http = require('http');
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const getJSON = (p) => new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
  const tabs = await getJSON('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('arm-game'));
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', ev => { const j = JSON.parse(ev.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});

  const probe = `(function(){
    const s = document.querySelector('.share-wrap');
    const v = document.querySelector('video');
    return JSON.stringify({
      share: !!s,
      shareVisible: s ? (getComputedStyle(s).display !== 'none') : false,
      video: v ? { rs: v.readyState, paused: v.paused } : null
    });
  })()`;

  console.log('开始监视 .share-wrap（最多等 180 秒）…');
  let appearedAt = null, goneAt = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    const r = await send('Runtime.evaluate', { expression: probe, returnByValue: true });
    let st = {}; try { st = JSON.parse(r.result.result.value); } catch (e) {}
    const el = ((Date.now() - t0) / 1000).toFixed(1);
    if (st.share && !appearedAt) {
      appearedAt = Date.now();
      console.log(`[${el}s] 🔔 检测到 .share-wrap 出现（video rs=${st.video && st.video.rs}）→ 看门狗应在 3 秒内自动关闭`);
    }
    if (appearedAt && !st.share && !goneAt) {
      goneAt = Date.now();
      console.log(`[${el}s] ✅ .share-wrap 已消失（存在了 ${((goneAt-appearedAt)/1000).toFixed(1)} 秒）`);
      break;
    }
    if (st.share && appearedAt && Date.now() - appearedAt > 12000) {
      console.log(`[${el}s] ⚠ 弹窗已存在 ${((Date.now()-appearedAt)/1000).toFixed(1)} 秒仍未消失 —— 自动关闭没生效`);
      break;
    }
    await sleep(400);
  }
  if (!appearedAt) console.log('❌ 180 秒内没有检测到 .share-wrap（你没打开？或弹窗在别的位置）');

  // 读脚本日志确认看门狗动作
  const r2 = await send('Runtime.evaluate', { expression: `(function(){
    const el = document.querySelector('#na-panel');
    if (!el) return '(无面板)';
    const t = el.innerText || '';
    const lines = t.split('\\n').filter(l => /浮层|分享|share|close-btn|自动关闭/.test(l));
    return lines.slice(-15).join('\\n') || '(日志里没有浮层相关行)';
  })()`, returnByValue: true });
  console.log('\n== 面板日志中的浮层相关行 ==');
  console.log(r2.result.result.value);
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
