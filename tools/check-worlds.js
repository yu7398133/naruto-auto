// 检查是否存在多个 JS 执行世界（TM 沙箱世界 + 主世界），各自跑了一份脚本
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => { try { s(JSON.parse(d)); } catch (e) { j(new Error('bad')); } });
}).on('error', j));

(async () => {
  const tabs = await getJ('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('arm-game'));
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const worlds = [];
  ws.addEventListener('message', e => {
    const j = JSON.parse(e.data);
    if (j.method === 'Runtime.executionContextCreated') worlds.push(j.params.context);
    if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); }
  });
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});
  await sleep(2500);

  console.log('=== JS 执行世界 ===');
  for (const c of worlds) {
    console.log(`  id=${c.id} name="${c.name || '(main)'}" origin=${(c.origin || '').slice(0, 50)}`);
  }

  // 在每个世界里查面板数量
  console.log('\n=== 各世界的面板数 / VERSION ===');
  for (const c of worlds) {
    try {
      const r = await send('Runtime.evaluate', {
        expression: `JSON.stringify({panels:document.querySelectorAll('#na-panel').length,
          vers:[...document.querySelectorAll('#na-panel')].map(p=>(p.textContent.match(/v([\\d.]+)/)||[])[1]),
          hasAuto:typeof window.__narutoAuto, owner:window.__narutoAutoOwnerVer||null})`,
        returnByValue: true, contextId: c.id,
      });
      if (r.result && r.result.result) console.log(`  [${c.name || 'main'}] ${r.result.result.value}`);
    } catch (e) { console.log(`  [${c.name || 'main'}] 不可访问`); }
  }
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
