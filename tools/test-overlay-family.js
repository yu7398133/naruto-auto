// 验证 readPopup 对 message-wrap / share-wrap 两族的分类
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
    const RP = (window.__narutoAuto && window.__narutoAuto.vision
                && window.__narutoAuto.vision.readPopup)
      ? window.__narutoAuto.vision.readPopup.bind(window.__narutoAuto.vision) : null;
    if (!RP) return JSON.stringify({ err: '页面仍是旧版' });

    out.base = RP();

    // ① share-wrap 模拟（真实结构）
    const s = document.createElement('div');
    s.className = 'share-wrap';
    s.style.cssText = 'position:fixed;left:0;top:0;width:1914px;height:663px;z-index:99999;';
    s.innerHTML = '<div class="back"></div>'
      + '<div class="share-container" style="width:460px;height:328px;margin:auto">'
      +   '<div class="share-header"><div class="header-right">'
      +     '<div class="close-btn" style="width:16px;height:16px;cursor:pointer"></div>'
      +   '</div><div class="label">生成分享图</div></div>'
      +   '<div class="share-body">使用手机QQ或微信扫描二维码后，点击右上角进行分享</div>'
      + '</div>';
    document.body.appendChild(s);
    out.share = RP();
    s.remove();

    // ② message-wrap 模拟
    const m = document.createElement('div');
    m.className = 'message-wrap';
    m.style.cssText = 'position:fixed;left:0;top:0;width:1914px;height:664px;z-index:99999;';
    m.innerHTML = '<div class="back"></div><div class="message-container">'
      + '<div class="title">提示</div>'
      + '<div class="message-list"><div class="list-item">长时间未操作，已退出游戏</div></div>'
      + '<div class="footer-container"><div class="footer-btn">取消</div>'
      + '<div class="footer-btn primary">关闭窗口</div></div></div>';
    document.body.appendChild(m);
    out.idleKick = RP();
    m.remove();

    // ③ renew 模拟
    const r3 = document.createElement('div');
    r3.className = 'message-wrap';
    r3.style.cssText = 'position:fixed;left:0;top:0;width:1914px;height:664px;z-index:99999;';
    r3.innerHTML = '<div class="back"></div><div class="message-container">'
      + '<div class="title">提示</div>'
      + '<div class="message-list"><div class="list-item">体验时长不足，请续时后继续游戏</div></div>'
      + '<div class="footer-container"><div class="footer-btn">退出</div>'
      + '<div class="footer-btn primary">继续体验</div></div></div>';
    document.body.appendChild(r3);
    out.renew = RP();
    r3.remove();

    out.clean = RP();
    return JSON.stringify(out, null, 1);
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(r?.result?.result?.value || JSON.stringify(r).slice(0, 2500));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
