// 打开 TM 的编辑器/详情页，读取已安装脚本的 updateURL 设置
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

// 用 /json/new 打开 TM 的编辑器指向该脚本
(async () => {
  let tabs = await getJSON('/json/list');
  let tm = tabs.find(t => t.url.includes(TM_ID) && t.type === 'page');
  if (!tm) {
    const u = `http://127.0.0.1:9222/json/new?${encodeURIComponent('chrome-extension://' + TM_ID + '/options.html#nav=dashboard')}`;
    await new Promise((res, rej) => http.get(u, { method: 'PUT' }, r => { r.resume(); r.on('end', res); }).on('error', rej));
    await sleep(3000);
    tabs = await getJSON('/json/list');
    tm = tabs.find(t => t.url.includes(TM_ID) && t.type === 'page');
  }
  if (!tm) { console.log('无法打开 TM 页面'); process.exit(1); }

  const { ws, send } = await cdp(tm.webSocketDebuggerUrl);
  await send('Runtime.enable', {});
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r?.result?.exceptionDetails) return { __exc: String(r.result.exceptionDetails.text).slice(0, 300) };
    return r?.result?.result?.value;
  };

  await sleep(1500);

  // 直接跳到该脚本的编辑页（TM 用 #nav=editor&id=... 或 /edit.html?id=...）
  console.log('=== 查脚本 id 与可用 API ===');
  console.log(JSON.stringify(await ev(`(async () => {
    const out = {};
    out.href = location.href;
    // TM 提供 tmAPI 或 TM_ 对象
    out.globals = Object.keys(window).filter(k => /^(tm|TM|TB|tamper)/i.test(k)).slice(0, 50);
    out.hasChrome = typeof chrome !== 'undefined';
    try {
      const r = await chrome.runtime.sendMessage({ cmd: 'GetScriptList', sync: false });
      if (Array.isArray(r)) {
        out.count = r.length;
        out.items = r.map(s => ({ id: s.id, name: s.name, version: s.version, updateURL: s.updateURL || null, downloadURL: s.downloadURL || null, enabled: s.enabled }));
        out.target = r.find(s => /火影/.test(s.name || ''));
      } else out.raw = JSON.stringify(r).slice(0, 300);
    } catch (e) { out.msgErr = String(e); }
    return out;
  })()`), null, 1));

  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
