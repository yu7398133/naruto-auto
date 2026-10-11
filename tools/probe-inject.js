// 探测 userscript 是否真的注入了（@grant none 的脚本不在 DOM <script> 里）
const fs = require('fs'); const http = require('http');
function get(p) { return new Promise((res, rej) => { http.get({ host: '127.0.0.1', port: 9222, path: p }, r => { let d = ''; r.setEncoding('utf8'); r.on('data', c => d += c); r.on('end', () => res(d)); }).on('error', rej); }); }
(async () => {
  const list = JSON.parse(await get('/json/list'));
  const page = list.find(t => t.type === 'page' && /start\.qq\.com/.test(t.url));
  const sock = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  sock.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params) => new Promise(res => { const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await new Promise(r => sock.addEventListener('open', r));

  const expr = `(() => {
    const out = {};
    // 脚本面板/悬浮球：常见 id/class 探测
    const cands = ['naruto-panel','naruto-ball','naruto-float','naruto-root','naruto-log','naruto-overlay'];
    out.domIds = cands.filter(c => document.getElementById(c)).concat(
      [...document.querySelectorAll('[id^=naruto],[class*=naruto]')].map(e=>e.id||e.className).slice(0,10)
    );
    // 脚本注入的全局
    out.globals = Object.keys(window).filter(k => /naruto|NARUTO/i.test(k)).slice(0,20);
    // 页面里所有 <script> 的 src（TM 注入的可能是 blob/moz-extension）
    out.scripts = [...document.querySelectorAll('script[src]')].map(s=>s.src).filter(s=>/extension|tamper|blob|user/i.test(s)).slice(0,10);
    out.scriptCount = document.querySelectorAll('script').length;
    out.bodyChildren = [...document.body.children].map(e=>e.tagName + (e.id?'#'+e.id:'') + (e.className?'.'+String(e.className).split(' ')[0]:'')).slice(-25);
    out.vis = document.visibilityState;
    return JSON.stringify(out, null, 1);
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(r.result.result.value);
  sock.close();
})().catch(e => console.log('ERR ' + e.message));
