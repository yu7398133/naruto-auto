// 最终验收：等视频就绪 -> 确认在最小化状态下视觉链路持续正常
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});

const PROBE = `(() => {
  const A = window.__narutoAuto;
  const v = A && A.vision ? A.vision.video : document.querySelector('video');
  const o = { hidden: document.hidden, hasWatchdog: !!window.__na_bg_watchdog__ };
  if (!v || v.tagName !== 'VIDEO') { o.video = false; return JSON.stringify(o); }
  o.video = true; o.paused = v.paused; o.rs = v.readyState;
  o.ct = +(v.currentTime || 0).toFixed(2); o.vw = v.videoWidth;
  if (v.videoWidth > 0) {
    try {
      const c = document.createElement('canvas'); c.width = 32; c.height = 32;
      const cx = c.getContext('2d'); cx.drawImage(v, 0, 0, 32, 32);
      const d = cx.getImageData(0, 0, 32, 32).data;
      let h = 0, s = 0;
      for (let i = 0; i < d.length; i += 8) h = (h * 31 + d[i]) >>> 0;
      for (let i = 0; i < d.length; i += 4) s += (d[i]+d[i+1]+d[i+2])/3;
      o.hash = h; o.avg = +(s/(d.length/4)).toFixed(1);
    } catch (e) { o.frameErr = String(e); }
  }
  try { o.scene = A && A.probe ? A.probe().scene : null; } catch (e) { o.scene = 'err'; }
  const st = window.__na_bg_watchdog_state__;
  if (st) { o.wdRevives = st.revives; o.wdFails = st.fails; o.wdSameFrame = st.sameFrame; }
  return JSON.stringify(o);
})()`;

(async () => {
  const tabs = await getJSON('/json/list');
  const game = tabs.find(t => t.type === 'page' && t.url.includes('start.qq.com'));
  const ws = new WebSocket(game.webSocketDebuggerUrl);
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
  await send('Runtime.enable', {});

  const ev = async () => {
    const r = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
    const v = r?.result?.result?.value;
    return v ? JSON.parse(v) : null;
  };

  // 等视频就绪
  console.log('=== 等待视频就绪 ===');
  for (let i = 0; i < 20; i++) {
    const s = await ev();
    if (s && s.video && s.rs >= 2 && s.vw > 0) { console.log('就绪:', JSON.stringify(s)); break; }
    console.log(`+${(i+1)*5}s`, JSON.stringify(s));
    await sleep(5000);
  }

  console.log('\n=== 最小化状态下连续观测 (60s) ===');
  const rows = [];
  for (let i = 0; i < 12; i++) {
    await sleep(5000);
    const s = await ev();
    rows.push(s);
    console.log(`+${(i+1)*5}s hidden=${s.hidden} paused=${s.paused} ct=${s.ct} hash=${s.hash} scene=${s.scene} revives=${s.wdRevives}`);
  }

  console.log('\n=== 判定 ===');
  const hid = rows.filter(r => r.hidden === true);
  console.log(`最小化采样: ${hid.length}/${rows.length}`);
  const ct = hid.map(r => r.ct).filter(x => typeof x === 'number');
  if (ct.length >= 2) {
    const d = ct[ct.length-1] - ct[0];
    console.log(`currentTime 推进: ${d.toFixed(1)}s ${d > 5 ? '✅' : '❌'}`);
  }
  const hs = new Set(hid.map(r => r.hash).filter(x => x != null));
  console.log(`帧 hash 去重: ${hs.size}/${hid.length} ${hs.size > 3 ? '✅ 画面持续变化' : '⚠'}`);
  const sc = [...new Set(hid.map(r => r.scene).filter(Boolean))];
  console.log(`场景: ${sc.join(', ')}`);
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
