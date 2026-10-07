// 在 Tampermonkey 管理页中定位目标脚本并触发更新
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
  const tabs = await getJSON('/json/list');
  const tm = tabs.find(t => t.url.includes(TM_ID) && t.type === 'page');
  if (!tm) { console.log('未找到 TM 页面'); process.exit(1); }

  const { ws, send } = await cdp(tm.webSocketDebuggerUrl);
  await send('Runtime.enable', {});

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r?.result?.exceptionDetails) return { __err: r.result.exceptionDetails.text };
    return r?.result?.result?.value;
  };

  // 导航到「已安装脚本」
  await ev(`location.hash = '#nav=scripts'; 'ok'`);
  await sleep(2500);

  const list = await ev(`(() => {
    const rows = document.querySelectorAll('tr, .script, [id^="script"]');
    const out = [];
    rows.forEach(r => {
      const t = (r.innerText || '').trim();
      if (t && /火影|naruto|自动化/i.test(t)) out.push(t.replace(/\\n+/g,' | ').slice(0,200));
    });
    return JSON.stringify({ hash: location.hash, matches: out.slice(0,10), bodyLen: document.body.innerText.length });
  })()`);
  console.log('=== 脚本列表 ===');
  console.log(typeof list === 'string' ? JSON.stringify(JSON.parse(list), null, 2) : list);

  // 打印部分正文确认
  const txt = await ev(`document.body.innerText.slice(0, 1200)`);
  console.log('\n=== 页面正文 ===');
  console.log(txt);

  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
