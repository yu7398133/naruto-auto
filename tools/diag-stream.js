// 检查游戏页当前是否还有视频流 / 处于什么状态
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => { try { s(JSON.parse(d)); } catch (e) { j(new Error('bad')); } });
}).on('error', j));

(async () => {
  const tabs = await getJ('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('arm-game'));
  if (!tab) { console.log('没有云游戏页'); return; }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', e => { const j = JSON.parse(e.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});
  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return 'EXC';
    return r.result.result.value;
  };

  console.log('页面标题:', await ev('document.title'));
  console.log('video 元素数:', await ev(`document.querySelectorAll('video').length`));
  console.log('gmsdk 容器:', await ev(`!!document.querySelector('#gmsdk-video-element, .gmsdk-video-player')`));
  console.log('video 详情:', await ev(`(function(){
    const v=document.querySelector('video');
    if(!v) return 'none';
    const r=v.getBoundingClientRect();
    return JSON.stringify({rs:v.readyState, paused:v.paused, t:+v.currentTime.toFixed(1), w:Math.round(r.width), h:Math.round(r.height), src:(v.src||'').slice(0,40)});
  })()`));
  console.log('\n弹窗状态:', await ev(`(function(){ const p=__narutoAuto.popup&&__narutoAuto.popup(); return JSON.stringify(p); })()`));
  console.log('页面可见:', await ev('!document.hidden'));
  console.log('body 前 200 字:', await ev(`(document.body.innerText||'').replace(/\\s+/g,' ').slice(0,200)`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
