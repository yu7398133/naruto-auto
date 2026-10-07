// 检查页面是否同时装载了多个脚本实例 / TM 里的实际版本
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

  console.log('-- 页面上的脚本注入痕迹 --');
  console.log(await ev(`(function(){
    const out={};
    out.scriptTags = Array.from(document.querySelectorAll('script')).filter(s=>/naruto|userscript|blob/i.test(s.src||s.textContent||'')).length;
    out.hasNarutoAuto = !!window.__narutoAuto;
    out.fab = !!document.querySelector('#na-fab');
    out.panel = !!document.querySelector('#na-panel');
    // 数一下有几个面板/悬浮球（多实例会出现多个）
    out.fabCount = document.querySelectorAll('#na-fab').length;
    out.panelCount = document.querySelectorAll('#na-panel').length;
    return JSON.stringify(out,null,1);
  })()`));

  console.log('\n-- ctx 自己身上(非原型)的属性 --');
  console.log(await ev(`(function(){
    const c=window.__narutoAuto.ctx;
    const own=Object.keys(c);
    return JSON.stringify({ ownCount: own.length, own: own.slice(0,40),
      op: typeof c.op, config: typeof c.config, nav: typeof c.nav },null,1);
  })()`));

  console.log('\n-- 直接问 ctx 有没有这些方法（含原型链全查）--');
  console.log(await ev(`(function(){
    const c=window.__narutoAuto.ctx;
    const found={};
    for(const n of ['_keepAliveMenu','_menuExit','_menuClick','sleepInterruptible','domTap','home','sleepAtHome']){
      found[n]=typeof c[n];
    }
    // 原型链
    let p=c, chain=[];
    while(p=Object.getPrototypeOf(p)){ chain.push(p.constructor?p.constructor.name:'?'); }
    return JSON.stringify({found, chain},null,1);
  })()`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
