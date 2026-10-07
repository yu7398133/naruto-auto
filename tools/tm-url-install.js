// 用 TM 实用工具的「从 URL 安装」入口
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
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('options.html'));
  const { ws, send } = await cdp(tab.webSocketDebuggerUrl);
  await send('Runtime.enable', {});
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
    if (r?.result?.exceptionDetails) return { __exc: String(r.result.exceptionDetails.text).slice(0,300) };
    return r?.result?.result?.value;
  };

  // 找「从 URL 安装」的输入框和按钮
  console.log('=== 定位 URL 安装控件 ===');
  console.log(await ev(`JSON.stringify(Array.from(document.querySelectorAll('input,button,a'))
    .filter(e => {
      const t = (e.innerText||e.value||e.placeholder||'') + ' ' + (e.id||'') + ' ' + (e.name||'');
      return /url|URL|安装|install/i.test(t);
    })
    .slice(0,20).map(e => ({ tag: e.tagName, id: e.id, type: e.type, ph: e.placeholder, val: e.value, txt: (e.innerText||'').slice(0,20) })), null, 1)`));

  // 填入 URL
  console.log('\n=== 填入 URL ===');
  console.log(await ev(`(() => {
    const inputs = Array.from(document.querySelectorAll('input[type=text], input:not([type])'));
    const t = inputs.find(i => /url/i.test(i.id + ' ' + i.placeholder));
    if (!t) return 'no url input; inputs=' + inputs.map(i=>i.id+'/'+i.placeholder).slice(0,10).join(', ');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(t, 'http://127.0.0.1:8899/naruto-auto.user.js');
    t.dispatchEvent(new Event('input', { bubbles: true }));
    t.dispatchEvent(new Event('change', { bubbles: true }));
    window.__urlInput = t;
    return 'filled: ' + t.id + ' -> ' + t.value;
  })()`));

  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
