// 直接诊断：为什么 __narutoAuto.ctx 是 undefined / 没有 _keepAliveMenu
(async () => {
  const http = require('http');
  const getJSON = (p) => new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
  const tabs = await getJSON('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('arm-game'));
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', ev => { const j = JSON.parse(ev.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});
  const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result.result.value;

  console.log(await ev(`(function(){
    const A = window.__narutoAuto;
    const a = A.app;
    const out = {
      version: (a && a.config && a.config.VERSION) || '?',
      A_ctx_typeof: typeof A.ctx,
      A_ctx_null: A.ctx === null,
      app_ctx_typeof: typeof (a && a.ctx),
      app_ctx_null: a ? (a.ctx === null) : 'no app',
      // app 上所有以 ctx/task/mission 开头的字段
      app_fields: a ? Object.keys(a).filter(k => /ctx|task|mission|hall|sched/i.test(k)) : [],
      // app 原型上的方法名里含 keepAlive 的
      proto_keepAlive: a ? Object.getOwnPropertyNames(Object.getPrototypeOf(a)).filter(n => /keepAlive|Menu/i.test(n)) : [],
      proto_has_keepAliveMenu: a ? (typeof Object.getPrototypeOf(a)._keepAliveMenu) : 'n/a',
      proto_has_menuExit: a ? (typeof Object.getPrototypeOf(a)._menuExit) : 'n/a'
    };
    return JSON.stringify(out, null, 1);
  })()`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
