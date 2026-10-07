// 部署环境侦查：找出脚本是如何被注入的
const http = require('http');
const fs = require('fs');

const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});

const PROBE = `(() => {
  const o = {};
  const A = window.__narutoAuto;
  o.hasApp = !!A;
  o.version = A && A.VERSION ? A.VERSION : (A && A.version ? A.version : null);
  if (A) o.keys = Object.keys(A);

  // 脚本管理器的痕迹
  o.gm = {
    GM_info: typeof GM_info !== 'undefined',
    GM_infoName: (typeof GM_info !== 'undefined' && GM_info.script) ? GM_info.script.name : null,
    GM_infoVersion: (typeof GM_info !== 'undefined' && GM_info.script) ? GM_info.script.version : null,
    GM_registerMenuCommand: typeof GM_registerMenuCommand !== 'undefined',
    tampermonkey: typeof window.tampermonkey !== 'undefined',
  };

  // 注入方式线索
  o.headScripts = Array.from(document.head.querySelectorAll('script')).map(s => ({
    src: s.src || '(inline)',
    type: s.type || '',
    len: (s.textContent||'').length
  })).filter(s => s.type.includes('script') || s.src.includes('user'));

  // 面板是否存在于 DOM
  o.panelEl = !!document.querySelector('[id*="naruto"],[class*="naruto"],[id*="auto"]');
  o.ids = Array.from(document.querySelectorAll('[id]')).map(e=>e.id).filter(x=>/naruto|auto|panel/i.test(x)).slice(0,20);

  return JSON.stringify(o);
})()`;

(async () => {
  const tabs = await getJSON('/json/list');
  const page = tabs.find(t => t.type === 'page' && t.url.includes('start.qq.com'));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => {
    const i = ++id; pend.set(i, r);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
  ws.addEventListener('message', ev => {
    const j = JSON.parse(ev.data);
    if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); }
  });
  await new Promise(r => ws.addEventListener('open', r));
  const r = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
  const v = r?.result?.result?.value;
  console.log(JSON.stringify(v ? JSON.parse(v) : r, null, 2));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
