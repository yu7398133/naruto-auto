// 排查 message-wrap 是否为通用组件：找同类结构、样式定义、以及可能的其它文案
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

  const expr = `(function(){
    const out = {};

    // 1) 搜索所有样式表里 .message-wrap / .footer-btn 的规则
    const rules = [];
    for (const ss of document.styleSheets) {
      let rs; try { rs = ss.cssRules; } catch(e) { continue; }
      if (!rs) continue;
      for (const r of rs) {
        const t = r.selectorText || '';
        if (/message-wrap|message-container|footer-btn|message-list|close-btn/i.test(t)) {
          rules.push({ sel: t.slice(0,90), css: (r.style && r.style.cssText || '').slice(0,180) });
        }
      }
    }
    out.cssRules = rules.slice(0, 30);

    // 2) 页面上是否已有 message-wrap 的兄弟/模板注释(v-if 提示了有多个分支)
    const w = document.querySelector('.message-wrap');
    out.wrapHTML = w ? w.outerHTML.replace(/<!--[^>]*-->/g, m => '[注释:' + m.slice(4,-3).trim() + ']').slice(0, 1400) : null;

    // 3) 找 vue 组件暴露的方法（能否程序化触发弹窗）
    const el = w;
    if (el && el.__vueParentComponent) {
      const c = el.__vueParentComponent;
      out.vueProps = Object.keys(c.props || {}).slice(0,30);
      out.vueCtx = Object.keys(c.ctx || {}).filter(k => !k.startsWith('_')).slice(0,40);
    }
    // 4) 全局是否有 message 相关 API
    out.globals = Object.keys(window).filter(k => /message|popup|dialog|alert|toast/i.test(k)).slice(0,25);
    return JSON.stringify(out, null, 1);
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(r?.result?.result?.value || JSON.stringify(r).slice(0, 3000));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
