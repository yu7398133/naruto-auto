// 精简输出：所有弹窗记录的关键字段
const http = require('http');
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => { try { s(JSON.parse(d)); } catch (e) { j(new Error('bad')); } });
}).on('error', j));

(async () => {
  const tabs = await getJ('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('arm-game'));
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', e => { const j = JSON.parse(e.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});
  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return 'EXC';
    return r.result.result.value;
  };

  const raw = await ev(`JSON.stringify(__narutoAuto.popupLog())`);
  const list = JSON.parse(raw);
  console.log(`共 ${list.length} 条弹窗记录:\n`);
  list.forEach((p, i) => {
    console.log(`[${i + 1}] ${p.at}  kind=${p.kind}  n=${p.n}`);
    console.log(`    标题: ${p.title}`);
    console.log(`    正文: ${(p.text || '').slice(0, 60)}`);
    console.log(`    按钮: ${(p.buttons || []).map(b => b.t + (b.primary ? '(主)' : '')).join(' / ')}`);
    console.log(`    视频: ${p.video ? 'rs=' + p.video.rs + ' paused=' + p.video.paused : '无'}`);
    console.log('');
  });

  const ka = await ev(`JSON.stringify((__narutoAuto.probes||[]).filter(p=>p.kind==='keepalive').slice(-8))`);
  console.log('保活记录(最近8条):', ka);
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
