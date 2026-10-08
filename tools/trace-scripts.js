// 用 Debugger 域抓所有被执行的脚本 URL，看 0.6.47 是否作为独立脚本被注入
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
  const urls = [];
  ws.addEventListener('message', e => {
    const j = JSON.parse(e.data);
    if (j.method === 'Debugger.scriptParsed') urls.push(j.params.url || '(inline)');
    if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); }
  });
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});
  await send('Debugger.enable', {});
  console.log('Debugger 已开，重载中...');
  await send('Page.enable', {});
  await send('Page.reload', { ignoreCache: true });
  await sleep(18000);

  const rel = urls.filter(u => /userscript|naruto|UserScript|chrome-extension.*\.js/i.test(u));
  console.log('\n=== 可疑脚本 URL（' + urls.length + ' 个总）===');
  [...new Set(rel)].forEach(u => console.log('  ' + u.slice(0, 130)));

  // 再查：当前 document 的 script 元素
  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    return r.result && r.result.exceptionDetails ? 'EXC' : r.result.result.value;
  };
  console.log('\n=== 当前 script 元素 ===');
  console.log(await ev(`JSON.stringify([...document.querySelectorAll('script')].map(s=>({src:(s.src||'(inline)').slice(0,80), len:(s.textContent||'').length, has47:/0\\.6\\.47/.test(s.textContent||''), has51:/0\\.6\\.51/.test(s.textContent||'')})))`));
  console.log('\n面板:', await ev(`JSON.stringify([...document.querySelectorAll('#na-panel')].map(p=>(p.textContent.match(/v([\\d.]+)/)||[])[1]))`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
