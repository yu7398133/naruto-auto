// 用正确的 API 名读取保活握手状态
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});

(async () => {
  const tabs = await getJSON('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('arm-game'));
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', ev => { const j = JSON.parse(ev.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});
  const ev = async (e, aw) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: !!aw });
    if (r.result && r.result.exceptionDetails) return 'EXC: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 160);
    return r.result.result.value;
  };

  console.log('kaSeenAt() 是函数吗:', await ev('typeof __narutoAuto.kaSeenAt'));
  const a = await ev('__narutoAuto.kaSeenAt()');
  console.log('T+0  kaSeenAt =', a, ' (0 = 代理从未 ping)');
  await sleep(4000);
  const b = await ev('__narutoAuto.kaSeenAt()');
  console.log('T+4  kaSeenAt =', b, b > a ? '✅ 代理正在 ping' : '❌ 代理没 ping');
  console.log('     kaExternalAlive =', await ev('__narutoAuto.kaExternalAlive()'));

  if (b > a) {
    console.log('\n== 真实保活测试 ==');
    console.log('保活前菜单:', await ev(`(function(){const x=document.querySelector('.setting-box');return x?/focus/.test(x.className):null;})()`));
    const r = await ev('__narutoAuto.keepAlive()', true);
    console.log('keepAlive() 返回:', r);
    console.log('保活后菜单:', await ev(`(function(){const x=document.querySelector('.setting-box');return x?/focus/.test(x.className):null;})()`));
    console.log('video:', await ev(`(function(){const v=document.querySelector('video');return v?JSON.stringify({rs:v.readyState,paused:v.paused,t:+v.currentTime.toFixed(1)}):'none';})()`));
  }
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
