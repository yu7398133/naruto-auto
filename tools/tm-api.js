// 通过 TM 的 options 页面 API 直接操作脚本存储
// Tampermonkey options 页运行在扩展上下文，可访问 chrome.runtime 与内部 store
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
  const { ws, send } = await cdp(tm.webSocketDebuggerUrl);
  await send('Runtime.enable', {});
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r?.result?.exceptionDetails) return { __exc: JSON.stringify(r.result.exceptionDetails).slice(0,500) };
    return r?.result?.result?.value;
  };

  console.log('=== 探测 TM 页面可用的全局对象 ===');
  console.log(JSON.stringify(await ev(`(() => {
    const o = {};
    o.hasChrome = typeof chrome !== 'undefined';
    o.hasRuntime = typeof chrome !== 'undefined' && !!chrome.runtime;
    o.extId = (typeof chrome !== 'undefined' && chrome.runtime) ? chrome.runtime.id : null;
    o.globals = Object.keys(window).filter(k => /^tm|tamper|TM|script|store/i.test(k)).slice(0,40);
    // TM 的 options 页通常会挂载一个内部对象
    o.hasTB = typeof window.TB !== 'undefined';
    o.hasTM = typeof window.TM !== 'undefined';
    o.TBkeys = (typeof window.TB !== 'undefined') ? Object.keys(window.TB).slice(0,40) : null;
    return o;
  })()`), null, 1));

  // 尝试读取脚本列表数据
  console.log('\n=== 尝试获取脚本源码 ===');
  console.log(JSON.stringify(await ev(`(async () => {
    try {
      // TM 通过 chrome.runtime.sendMessage 与后台通信
      const r = await chrome.runtime.sendMessage({ cmd: 'GetScriptList', sync: false });
      return { ok: true, type: typeof r, len: Array.isArray(r) ? r.length : (r ? Object.keys(r).length : 0) };
    } catch(e) { return { err: String(e) }; }
  })()`), null, 1));

  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
