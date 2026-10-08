// 在 Debugger 里抓所有 inline 脚本源码，找出含 VERSION 0.6.47 的那一份
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
  const scripts = [];
  ws.addEventListener('message', e => {
    const j = JSON.parse(e.data);
    if (j.method === 'Debugger.scriptParsed') scripts.push({ sid: j.params.scriptId, url: j.params.url, len: j.params.length });
    if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); }
  });
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});
  await send('Debugger.enable', {});
  await send('Page.enable', {});
  console.log('重载并抓取脚本...');
  await send('Page.reload', { ignoreCache: true });
  await sleep(18000);

  // 只看 inline（无 url）且长度 > 100KB 的（脚本约 617KB）
  const cand = scripts.filter(s => !s.url && s.len > 100000).sort((a, b) => b.len - a.len);
  console.log(`\n候选 inline 大脚本: ${cand.length} 个`);
  for (const s of cand.slice(0, 6)) {
    const r = await send('Debugger.getScriptSource', { scriptId: s.sid });
    const src = (r.result && r.result.scriptSource) || '';
    const v = (src.match(/const VERSION = '([\d.]+)'/) || [])[1] || '?';
    const av = (src.match(/@version\s+([\d.]+)/) || [])[1] || '?';
    console.log(`  len=${s.len}  VERSION=${v}  @version=${av}  id=${s.sid}`);
  }
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
