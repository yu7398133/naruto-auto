// 看门狗实测：最小化状态下，主动 play() 能否把冻结的 video 救活
// 用法: node tools/bg-watchdog-test.js
const http = require('http');

const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});

const SAMPLE = `(() => {
  const v = document.querySelector('video');
  if (!v) return JSON.stringify({err:'no-video'});
  const c = document.createElement('canvas'); c.width=64; c.height=64;
  const cx = c.getContext('2d'); cx.drawImage(v,0,0,64,64);
  const d = cx.getImageData(0,0,64,64).data;
  let h=0; for(let i=0;i<d.length;i+=16){ h=(h*31+d[i])>>>0; }
  return JSON.stringify({
    hidden: document.hidden, paused: v.paused, rs: v.readyState,
    ct: +(v.currentTime||0).toFixed(2), hash: h,
    pausedProp: v.paused, muted: v.muted, vol: v.volume
  });
})()`;

// 尝试多种唤醒手段
const WAKE = `(() => {
  const v = document.querySelector('video');
  if (!v) return JSON.stringify({err:'no-video'});
  const r = { tried: [] };
  try { v.muted = true; r.tried.push('muted=true'); } catch(e){}
  const p = v.play();
  if (p && p.then) {
    p.then(()=>r.playResolved='ok').catch(e=>r.playRejected=String(e));
  }
  r.tried.push('play()');
  return JSON.stringify(r);
})()`;

(async () => {
  const tabs = await getJSON('/json/list');
  const page = tabs.find(t => t.type === 'page' && t.url.includes('start.qq.com'));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => {
    const i = ++id; pend.set(i, r);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
  ws.addEventListener('message', ev => {
    const j = JSON.parse(ev.data);
    if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); }
  });
  await new Promise(r => ws.addEventListener('open', r));

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    const v = r?.result?.result?.value;
    return v ? JSON.parse(v) : null;
  };

  console.log('=== 阶段1: 唤醒前 ===');
  const before1 = await ev(SAMPLE);
  console.log(before1);
  await new Promise(r => setTimeout(r, 3000));
  const before2 = await ev(SAMPLE);
  console.log(before2);
  console.log(before1.hash === before2.hash ? '→ 帧冻结确认 (hash 相同)' : '→ 帧仍在变?');

  console.log('\n=== 阶段2: 执行唤醒 play() ===');
  console.log(await ev(WAKE));

  console.log('\n=== 阶段3: 唤醒后连续观测 ===');
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 4000));
    const s = await ev(SAMPLE);
    console.log(`+${(i+1)*4}s`, JSON.stringify(s));
  }
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
