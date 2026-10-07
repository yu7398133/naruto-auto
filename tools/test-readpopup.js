// 用注入的真实 DOM 结构验证 readPopup 的解析（含 idle-kick / renew 两种语义）
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

    // ── 造一个和平台完全同构的弹窗（class 名/层级/按钮文案照抄实测）──
    const mk = (title, text, btns) => {
      const w = document.createElement('div');
      w.className = 'message-wrap';
      w.style.cssText = 'position:fixed;left:0;top:0;width:1914px;height:664px;z-index:99999;display:flex';
      w.innerHTML = '<div class="back"></div>'
        + '<div class="message-container" style="width:362px;height:177px;margin:auto">'
        +   '<div class="close-btn" style="width:24px;height:24px"></div>'
        +   '<div class="title">' + title + '</div>'
        +   '<div class="message-list"><div class="list-item center-content">' + text + '</div></div>'
        +   '<div class="footer-container">'
        +     btns.map(b => '<div class="footer-btn' + (b.p ? ' primary' : '') + '">' + b.t + '</div>').join('')
        +   '</div>'
        + '</div>';
      return w;
    };

    const Vision = window.__narutoAuto && window.__narutoAuto.vision;
    if (!Vision || typeof Vision.readPopup !== 'function') {
      return JSON.stringify({ err: 'readPopup 不存在 —— 页面还没刷新到 v0.6.45' });
    }
    // 就地给一个 readPopup 的实现副本用于测试（不依赖页面是否已加载新代码）
    const readPopup = Vision.readPopup.bind(Vision);

    // ① 无弹窗
    out.noPopup = readPopup();

    // ② 「长时间未操作，已退出游戏」——实测的这一种
    let w1 = mk('提示', '长时间未操作，已退出游戏', [{t:'取消'},{t:'关闭窗口',p:true}]);
    document.body.appendChild(w1);
    out.idleKick = readPopup();
    w1.remove();

    // ③ 假想的「续时」弹窗——验证语义分类能否认出来
    let w2 = mk('提示', '体验时长不足，是否继续游戏？', [{t:'退出游戏'},{t:'继续体验',p:true}]);
    document.body.appendChild(w2);
    out.renew = readPopup();
    w2.remove();

    // ④ 已隐藏的弹窗不应被当作存在
    let w3 = mk('提示', '长时间未操作，已退出游戏', [{t:'取消'},{t:'关闭窗口',p:true}]);
    w3.style.display = 'none';
    document.body.appendChild(w3);
    out.hidden = readPopup();
    w3.remove();

    out.cleanAfter = readPopup();
    return JSON.stringify(out, null, 1);
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(r?.result?.result?.value || JSON.stringify(r).slice(0, 2500));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
