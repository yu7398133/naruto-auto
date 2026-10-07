// 弹窗出现后：视频元素状态 + 页面游戏容器
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
    out.videoCount = document.querySelectorAll('video').length;
    out.canvasCount = document.querySelectorAll('canvas').length;
    out.hasMessageWrap = !!document.querySelector('.message-wrap');
    const w = document.querySelector('.message-wrap');
    if (w) { const cs = getComputedStyle(w); out.popup = { disp: cs.display, vis: cs.visibility, op: cs.opacity, z: cs.zIndex }; }

    const hosts = [...document.querySelectorAll('div')]
      .filter(e => /player|video|game|screen/i.test(String(e.className) + e.id))
      .slice(0, 10);
    out.hosts = hosts.map(e => ({
      cls: String(e.className).slice(0,55), id: e.id, kids: e.children.length,
      txt: (e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,60)
    }));

    // 「关闭窗口」/「取消」按钮的精确坐标(仅供参考, 但坐标可能因窗口尺寸不同而不同)
    out.footer = [...document.querySelectorAll('.message-wrap .footer-btn')].map(b => {
      const r = b.getBoundingClientRect();
      return { txt: b.innerText.trim(), x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2),
               xr: +(r.x + r.width/2).toFixed(1), yr: +(r.y + r.height/2).toFixed(1),
               relX: +((r.x + r.width/2)/innerWidth).toFixed(3), relY: +((r.y + r.height/2)/innerHeight).toFixed(3) };
    });
    out.inner = { w: innerWidth, h: innerHeight };
    return JSON.stringify(out, null, 1);
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(r?.result?.result?.value || JSON.stringify(r).slice(0, 2000));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
