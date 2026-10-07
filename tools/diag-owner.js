// 判断 __narutoAuto 到底是谁写的：比对 app 的特征
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
    const A = window.__narutoAuto, a = A.app;
    const keys = Object.keys(A);
    return JSON.stringify({
      // 我们 v0.6.47 的 hook 集合
      has_menu: typeof A.menu,
      has_keepAlive: typeof A.keepAlive,
      has_ctx: typeof A.ctx,
      has_streamAlive: typeof A.streamAlive,
      has_popup: typeof A.popup,
      has_reviveStream: typeof A.reviveStream,
      allKeys: keys,
      // app 的字段名（我们的 NarutoAuto 用 config；看门狗可能用别的）
      appKeys: Object.keys(a),
      appHasReadMenu: typeof (a.vision && a.vision.readMenu),
      appHasReadPopup: typeof (a.vision && a.vision.readPopup),
      appCtor: a.constructor ? a.constructor.name : '?'
    },null,1);
  })()`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
