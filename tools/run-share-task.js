// 直接跑「每日分享」任务，全程监视 .share-wrap 出现/消失 + 抓面板日志
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

  // 面板日志条数基线
  const base = await send('Runtime.evaluate', { expression:
    `(function(){const p=document.querySelector('#na-panel');return p?p.innerText.length:0;})()`,
    returnByValue: true });
  const baseLen = base.result.result.value;
  console.log('面板日志基线长度:', baseLen);

  // 启动「每日分享」任务
  const start = await send('Runtime.evaluate', { expression: `(function(){
    const A = window.__narutoAuto;
    if (!A) return 'no __narutoAuto';
    try {
      A.show && A.show();
      // 直接跑单个任务：优先用 app.runTask / 或 TaskRegistry
      const app = A.app;
      if (app && typeof app.runTask === 'function') { app.runTask('shareDaily'); return 'runTask(shareDaily)'; }
      if (app && typeof app.run === 'function')     { app.run('shareDaily');    return 'run(shareDaily)'; }
      return 'no run method; keys=' + Object.keys(app||{}).filter(k=>/run|task/i.test(k)).join(',');
    } catch(e) { return 'ERR ' + e.message; }
  })()`, returnByValue: true });
  console.log('启动结果:', start.result.result.value);

  // 监视
  const probe = `(function(){
    const s = document.querySelector('.share-wrap');
    const v = document.querySelector('video');
    return JSON.stringify({ share: !!s, video: v ? { rs: v.readyState } : null });
  })()`;
  console.log('\n开始监视（最多 120 秒）…');
  const t0 = Date.now(); let appearedAt = null, goneAt = null;
  while (Date.now() - t0 < 120000) {
    const r = await send('Runtime.evaluate', { expression: probe, returnByValue: true });
    let st = {}; try { st = JSON.parse(r.result.result.value); } catch (e) {}
    const el = ((Date.now() - t0) / 1000).toFixed(1);
    if (st.share && !appearedAt) { appearedAt = Date.now(); console.log(`[${el}s] 🔔 .share-wrap 出现（video rs=${st.video&&st.video.rs}）`); }
    if (appearedAt && !st.share && !goneAt) { goneAt = Date.now(); console.log(`[${el}s] ✅ .share-wrap 消失（存在 ${((goneAt-appearedAt)/1000).toFixed(1)}s）`); break; }
    if (st.share && appearedAt && Date.now() - appearedAt > 20000) { console.log(`[${el}s] ⚠ 已存在 ${((Date.now()-appearedAt)/1000).toFixed(1)}s 未消失`); break; }
    await sleep(300);
  }
  if (!appearedAt) console.log('（监视期内没出现 .share-wrap）');

  // 抓新增日志
  const after = await send('Runtime.evaluate', { expression:
    `(function(){const p=document.querySelector('#na-panel');return p?p.innerText.slice(${baseLen}):'';})()`,
    returnByValue: true });
  console.log('\n== 新增面板日志 ==');
  console.log((after.result.result.value || '(无)').split('\n').filter(l=>l.trim()).slice(-45).join('\n'));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
