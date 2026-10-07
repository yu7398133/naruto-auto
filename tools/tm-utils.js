// 打开 TM 的「实用工具」并抓取日志/错误信息
const http = require('http');
const TM_ID = 'gcalenpjmijncebpfijmoaglllgpjagf';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});

function cdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0; const pend = new Map();
    const send = (m, p) => new Promise(r => {
      const i = ++id; pend.set(i, r);
      ws.send(JSON.stringify({ id: i, method: m, params: p }));
    });
    ws.addEventListener('message', ev => {
      const j = JSON.parse(ev.data);
      if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); }
    });
    ws.addEventListener('open', () => resolve({ ws, send }));
    ws.addEventListener('error', reject);
  });
}

(async () => {
  // 打开一个全新的 options 页，直接定位到 utilities
  const u = `http://127.0.0.1:9222/json/new?${encodeURIComponent('chrome-extension://' + TM_ID + '/options.html#nav=utils')}`;
  await new Promise((res, rej) => http.get(u, { method: 'PUT' }, r => { r.resume(); r.on('end', res); }).on('error', rej));
  await sleep(3500);

  const tabs = await getJSON('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('options.html'));
  const { ws, send } = await cdp(tab.webSocketDebuggerUrl);
  await send('Runtime.enable', {});
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r?.result?.exceptionDetails) return { __exc: String(r.result.exceptionDetails.text).slice(0,300) };
    return r?.result?.result?.value;
  };

  await sleep(1500);
  console.log('=== 实用工具页 ===');
  console.log(String(await ev(`document.body.innerText.slice(0, 2000)`)).slice(0, 2000));

  // 找「显示日志」入口
  console.log('\n=== 查找日志入口 ===');
  console.log(await ev(`JSON.stringify(Array.from(document.querySelectorAll('a,button,input,div,span'))
    .filter(e => /日志|log|Log/i.test((e.innerText||e.value||'') + (e.id||'')))
    .slice(0,15).map(e => e.tagName + '#' + e.id + ':' + (e.innerText||e.value||'').trim().slice(0,25)), null, 1)`));

  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
