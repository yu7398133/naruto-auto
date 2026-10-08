// 诊断代理是否真的在服务页面
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});

(async () => {
  const tabs = await getJSON('/json/list');
  const game = tabs.filter(t => t.type === 'page' && t.url.includes('arm-game'));
  console.log('云游戏页面数:', game.length);

  for (const tab of game) {
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    let id = 0; const pend = new Map();
    const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
    ws.addEventListener('message', ev => { const j = JSON.parse(ev.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
    await new Promise(r => ws.addEventListener('open', r));
    await send('Runtime.enable', {});
    const ev = async (e) => {
      const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
      if (r.result && r.result.exceptionDetails) return 'EXC';
      return r.result.result.value;
    };

    console.log('\n── 页面:', tab.url.slice(0, 60));
    console.log('   有 __narutoAuto:', await ev('typeof window.__narutoAuto'));
    console.log('   有 kaPing API  :', await ev('typeof (window.__narutoAuto&&window.__narutoAuto.kaPing)'));
    console.log('   __kaSeenAt     :', await ev('window.__narutoAuto ? (window.__narutoAuto.__kaSeenAt||0) : "n/a"'));
    console.log('   Date.now()     :', await ev('Date.now()'));
    console.log('   kaExternalAlive:', await ev('window.__narutoAuto&&window.__narutoAuto.kaExternalAlive ? window.__narutoAuto.kaExternalAlive() : "n/a"'));
    console.log('   面板版本       :', await ev(`(function(){const h=document.querySelector('.na-head,.na-title');return h?h.textContent.trim().slice(0,40):'(无面板)';})()`));

    // 等 4 秒，看 __kaSeenAt 是否被代理推高
    const a = await ev('window.__narutoAuto ? (window.__narutoAuto.__kaSeenAt||0) : 0');
    await sleep(4000);
    const b = await ev('window.__narutoAuto ? (window.__narutoAuto.__kaSeenAt||0) : 0');
    console.log(`   4秒内 __kaSeenAt: ${a} → ${b}  ${b > a ? '✅ 代理正在 ping' : '❌ 代理没在 ping 这个页面'}`);
    ws.close();
  }
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
