// 验证 v0.6.55：版本、模板是否可解码、特权商店任务是否走模板匹配
const fs = require('fs');
const path = require('path');
const http = require('http');

function get(pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: 9222, path: pathname }, res => {
      let d = ''; res.setEncoding('utf8');
      res.on('data', c => d += c); res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}
function ws(url) {
  return new Promise((resolve, reject) => {
    const WebSocket = require('ws');
    resolve(new WebSocket(url));
  });
}

(async () => {
  // 用内置 WebSocket
  const list = JSON.parse(await get('/json/list'));
  const page = list.find(t => t.type === 'page' && /start\.qq\.com/.test(t.url));
  if (!page) { console.log('NO_GAME_TAB'); console.log(JSON.stringify(list.map(t => [t.type, t.url]).slice(0, 10))); return; }
  console.log('TAB: ' + page.url);

  const sock = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  sock.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params) => new Promise(res => { const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await new Promise(r => sock.addEventListener('open', r));

  const expr = `(() => {
    const s = [...document.querySelectorAll('script')].map(e=>e.textContent||'').join('\\n');
    const m = s.match(/const VERSION = '([^']+)'/);
    const hasLoader = /PRIV_SHOP_TMPL_SRC/.test(s) && /loadPrivShopTmpl/.test(s);
    const nTmpl = (s.match(/data:image\\/png;base64,/g) || []).length;
    return JSON.stringify({
      version: m ? m[1] : 'NOT_FOUND',
      hasPrivTmplCode: hasLoader,
      base64TemplateCount: nTmpl,
      vis: document.visibilityState,
      videoCount: document.querySelectorAll('video').length
    });
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log('PAGE: ' + (r.result && r.result.result && r.result.result.value));
  sock.close();
})().catch(e => console.log('ERR ' + e.message));
