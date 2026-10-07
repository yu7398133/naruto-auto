// 检查 ctx 的原型方法 + 页面真实加载的版本
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
    const c = window.__narutoAuto.ctx;
    const proto = Object.getPrototypeOf(c);
    const names = Object.getOwnPropertyNames(proto);
    return JSON.stringify({
      ctxCtor: c.constructor ? c.constructor.name : '?',
      has_keepAliveMenu: typeof c._keepAliveMenu,
      has_menuExit: typeof c._menuExit,
      has_menuClick: typeof c._menuClick,
      has_sleepInterruptible: typeof c.sleepInterruptible,
      protoMenuMethods: names.filter(n => /Menu|keepAlive|menu/i.test(n))
    }, null, 1);
  })()`));

  console.log('\n-- 页面版本探测 --');
  console.log(await ev(`(function(){
    const A=window.__narutoAuto;
    const out={};
    out.app_version = A.app && A.app.config ? A.app.config.version : 'n/a';
    out.readMenuType = typeof (A.app && A.app.vision && A.app.vision.readMenu);
    out.readPopupType = typeof (A.app && A.app.vision && A.app.vision.readPopup);
    // 从面板标题抓版本号
    const p=document.querySelector('#na-panel');
    out.panelHead = p ? (p.innerText||'').split('\\n').slice(0,3).join(' | ') : 'no panel';
    return JSON.stringify(out,null,1);
  })()`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
