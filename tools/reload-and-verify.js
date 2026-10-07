// 重载游戏页，让新脚本（0.6.37 + 看门狗）生效，然后验证
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0; const pend = new Map();
    const send = (m, p) => new Promise(r => {
      const i = ++id; pend.set(i, r);
      ws.send(JSON.stringify({ id: i, method: m, params: p }));
    });
    ws.addEventListener('message', ev => {
      const j = JSON.parse(ev.data);
      if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); }
    });
    ws.addEventListener('open', () => resolve({ ws, send }));
    ws.addEventListener('error', reject);
  });
}

(async () => {
  const tabs = await getJSON('/json/list');
  const game = tabs.find(t => t.type === 'page' && t.url.includes('start.qq.com'));
  if (!game) { console.log('未找到游戏页'); process.exit(1); }

  const { ws, send } = await connect(game.webSocketDebuggerUrl);
  await send('Runtime.enable', {});
  await send('Page.enable', {});

  console.log('重载游戏页...');
  await send('Page.reload', { ignoreCache: true });

  // 等页面与脚本初始化
  for (let i = 0; i < 12; i++) {
    await sleep(5000);
    try {
      const r = await send('Runtime.evaluate', {
        expression: `JSON.stringify({
          hasApp: !!window.__narutoAuto,
          hasWatchdog: !!window.__na_bg_watchdog__,
          hasWatchBackground: !!(window.__narutoAuto && window.__narutoAuto.app && window.__narutoAuto.app._watchBackground),
          panel: (function(){const p=document.querySelector('#na-panel');return p?(p.innerText||'').trim().split('\\n')[0]:null})(),
          hidden: document.hidden,
          videoReady: !!(window.__narutoAuto && window.__narutoAuto.vision && window.__narutoAuto.vision.video)
        })`,
        returnByValue: true
      });
      const v = r?.result?.result?.value;
      console.log(`+${(i+1)*5}s`, v);
      if (v) {
        const o = JSON.parse(v);
        if (o.hasApp && o.hasWatchdog) { console.log('\n✅ 主脚本与看门狗均已生效'); break; }
      }
    } catch (e) { console.log(`+${(i+1)*5}s eval失败(页面重载中):`, e.message); }
  }
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
