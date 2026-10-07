// 严格版看门狗验证：全程最小化，先确认冻结，再唤醒，长观测
// 用法: node tools/bg-watchdog-test2.js
const http = require('http');

const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});

const SAMPLE = `(() => {
  const v = document.querySelector('video');
  if (!v) return JSON.stringify({err:'no-video'});
  let hash=0, avg=-1, colors=0;
  if (v.videoWidth > 0) {
    const c = document.createElement('canvas'); c.width=64; c.height=64;
    const cx = c.getContext('2d'); cx.drawImage(v,0,0,64,64);
    const d = cx.getImageData(0,0,64,64).data;
    let s=0; const set=new Set();
    for (let i=0;i<d.length;i+=4){ s+=(d[i]+d[i+1]+d[i+2])/3; set.add((d[i]>>4)+','+(d[i+1]>>4)+','+(d[i+2]>>4)); }
    avg=+(s/(d.length/4)).toFixed(1); colors=set.size;
    for(let i=0;i<d.length;i+=16){ hash=(hash*31+d[i])>>>0; }
  }
  let scene=null;
  try { const A=window.__narutoAuto; if(A&&A.probe) scene=A.probe().scene; } catch(e){}
  return JSON.stringify({
    hidden: document.hidden, paused: v.paused, rs: v.readyState,
    ct: +(v.currentTime||0).toFixed(2), hash, avg, colors, scene
  });
})()`;

const WAKE = `(() => {
  const v = document.querySelector('video');
  if (!v) return JSON.stringify({err:'no-video'});
  const r = {};
  if (v.readyState >= 2 && v.paused) { v.play().then(()=>r.play='ok').catch(e=>r.play=String(e)); }
  else r.play = 'skipped(rs='+v.readyState+',paused='+v.paused+')';
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
  const line = (tag, o) => console.log(
    `${tag}  hidden=${String(o.hidden).padEnd(5)} rs=${String(o.rs).padEnd(2)} ` +
    `${(o.paused?'暂停':'播放')} ct=${String(o.ct).padEnd(8)} ` +
    `avg=${String(o.avg).padEnd(6)} colors=${String(o.colors).padEnd(4)} ` +
    `hash=${String(o.hash).padEnd(11)} scene=${o.scene||o.err||''}`
  );

  console.log('=== 阶段A: 唤醒前基线 (确认是否冻结) ===');
  const a = [];
  for (let i = 0; i < 3; i++) {
    const s = await ev(SAMPLE); a.push(s); line(`A${i+1}`, s);
    if (i < 2) await new Promise(r => setTimeout(r, 4000));
  }
  const frozen = new Set(a.map(x => x.hash)).size === 1;
  console.log(frozen ? '>>> 冻结确认 (3次hash相同)' : '>>> 未冻结,帧本来就在动');
  if (a.some(x => x.hidden === false)) console.log('!!! 警告: 期间窗口不处于最小化,数据不可信');

  console.log('\n=== 阶段B: 执行唤醒 ===');
  console.log(await ev(WAKE));

  console.log('\n=== 阶段C: 唤醒后长观测 (请保持最小化) ===');
  const c = [];
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const s = await ev(SAMPLE); c.push(s); line(`C${i+1}`, s);
  }

  console.log('\n=== 判定 ===');
  const cHidden = c.filter(x => x.hidden === true);
  console.log(`阶段C 中仍处于最小化的采样: ${cHidden.length}/${c.length}`);
  const ctC = cHidden.map(x => x.ct).filter(x => typeof x === 'number' && x > 0);
  if (ctC.length >= 2) {
    const d = ctC[ctC.length-1] - ctC[0];
    console.log(`最小化状态下 currentTime 推进: ${d.toFixed(1)}s  ${d > 2 ? '✅ 帧在更新' : '❌ 帧停滞'}`);
  }
  const hs = new Set(cHidden.map(x => x.hash));
  console.log(`最小化状态下 hash 去重: ${hs.size}/${cHidden.length}  ${hs.size > 3 ? '✅ 画面持续变化' : '⚠ 画面变化少'}`);
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
