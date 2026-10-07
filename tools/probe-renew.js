// 探测 START 云游戏页面上「续时/延长/继续游戏」之类的弹窗元素
(async () => {
  const http = require('http');
  const getJSON = (p) => new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
  const tabs = await getJSON('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('arm-game'));
  if (!tab) { console.log('未找到游戏页'); process.exit(1); }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', ev => { const j = JSON.parse(ev.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});

  const expr = `(function(){
    const kw = ['续','延长','继续','剩余','时长','体验','超时','重新连接','重新登录','断开','断线','失效','退出','确定','确认'];
    const hits = [];
    document.querySelectorAll('*').forEach(el => {
      if (el.children.length > 3) return;
      const t = (el.textContent || '').trim();
      if (!t || t.length > 40) return;
      if (kw.some(k => t.includes(k))) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          hits.push({ t, tag: el.tagName, cls: String(el.className).slice(0,60),
                      x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2),
                      w: Math.round(r.width), h: Math.round(r.height) });
        }
      }
    });
    // 视频状态
    const v = document.querySelector('video');
    const vinfo = v ? { readyState: v.readyState, paused: v.paused, currentTime: Math.round(v.currentTime), w: v.videoWidth, h: v.videoHeight } : null;
    return JSON.stringify({ url: location.href.slice(0,110), hits: hits.slice(0,60), vinfo }, null, 1);
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(r?.result?.result?.value || JSON.stringify(r).slice(0,2000));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
