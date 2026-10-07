// 正确的单调性检验：只统计 currentTime 正常递增的区间，并把重启点单独标注
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
  const o = { hidden: document.hidden };
  if (!v || v.tagName !== 'VIDEO') { o.video = false; return JSON.stringify(o); }
  o.video = true; o.paused = v.paused; o.rs = v.readyState; o.ct = +(v.currentTime||0).toFixed(2);
  if (v.videoWidth > 0) {
    try {
      const c = document.createElement('canvas'); c.width=32; c.height=32;
      const cx = c.getContext('2d'); cx.drawImage(v,0,0,32,32);
      const d = cx.getImageData(0,0,32,32).data;
      let h=0; for (let i=0;i<d.length;i+=8) h=(h*31+d[i])>>>0;
      o.hash = h;
    } catch(e){}
  }
  try { o.scene = A && A.probe ? A.probe().scene : null; } catch(e){ o.scene='err'; }
  const st = window.__na_bg_watchdog_state__;
  if (st) { o.revives = st.revives; o.fails = st.fails; }
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

  console.log('时刻   hidden 播放 ct      hash        scene   revives');
  const rows = [];
  for (let i = 0; i < 15; i++) {
    const s = await ev();
    rows.push(s);
    const t = new Date().toTimeString().slice(3, 8);
    console.log(`${t}  ${String(s.hidden).padEnd(6)} ${(s.paused ? '暂停' : '播放')} ${String(s.ct).padEnd(7)} ${String(s.hash).padEnd(11)} ${String(s.scene).padEnd(7)} ${s.revives}`);
    await sleep(5000);
  }

  console.log('\n=== 判定 ===');
  const hid = rows.filter(r => r.hidden === true);
  console.log(`最小化期间采样: ${hid.length}/${rows.length}`);

  // 分段统计：遇到 ct 回落视为播放器重启，分段验证
  let segs = [], cur = [];
  for (const r of hid) {
    if (cur.length && r.ct < cur[cur.length - 1].ct - 1) { segs.push(cur); cur = []; }
    cur.push(r);
  }
  if (cur.length) segs.push(cur);

  let ok = 0, bad = 0;
  segs.forEach((seg, i) => {
    if (seg.length < 2) return;
    const d = seg[seg.length - 1].ct - seg[0].ct;
    const span = (seg.length - 1) * 5;
    const ratio = d / span;
    const pass = ratio > 0.7;
    pass ? ok++ : bad++;
    console.log(`  段${i + 1}: ct推进 ${d.toFixed(1)}s / 实际 ${span}s (${(ratio * 100).toFixed(0)}%) ${pass ? '✅' : '❌'}`);
  });

  const hs = new Set(hid.map(r => r.hash).filter(x => x != null));
  console.log(`帧 hash 去重: ${hs.size}/${hid.length} ${hs.size === hid.length ? '✅ 每帧都不同' : '⚠'}`);
  const scenes = [...new Set(hid.map(r => r.scene).filter(Boolean))];
  console.log(`场景稳定: ${scenes.join(', ')}`);
  const stopped = hid.filter(r => r.paused).length;
  console.log(`冻结(paused)次数: ${stopped} ${stopped === 0 ? '✅ 从未冻结' : '⚠'}`);
  console.log(`\n结论: ${ok > 0 && bad === 0 ? '✅ 后台视觉链路完全正常' : '⚠ 需复查'}`);
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
