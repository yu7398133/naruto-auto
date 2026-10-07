// 后台挂机采样器：持续观测最小化状态下视觉链路是否存活
// 用法: node tools/bg-sampler.js [间隔秒] [采样次数] [输出文件]
const http = require('http');
const fs = require('fs');

const INTERVAL = parseInt(process.argv[2] || '10', 10);
const ROUNDS   = parseInt(process.argv[3] || '18', 10);
const OUTFILE  = process.argv[4] || 'tools/bg-sample-result.json';

const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});

const PROBE = `(() => {
  const o = {};
  try {
    o.hidden = document.hidden;
    o.visibility = document.visibilityState;
    const v = document.querySelector('video');
    if (!v) { o.err = 'no-video'; return JSON.stringify(o); }
    o.rs = v.readyState; o.vw = v.videoWidth; o.vh = v.videoHeight;
    o.paused = v.paused; o.ct = +(v.currentTime||0).toFixed(2);
    if (v.videoWidth > 0) {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const cx = c.getContext('2d');
      cx.drawImage(v, 0, 0, 64, 64);
      const d = cx.getImageData(0, 0, 64, 64).data;
      let sum=0, mx=0; const set=new Set();
      for (let i=0;i<d.length;i+=4){
        sum += (d[i]+d[i+1]+d[i+2])/3;
        if(d[i]>mx)mx=d[i];
        set.add((d[i]>>4)+','+(d[i+1]>>4)+','+(d[i+2]>>4));
      }
      o.avg = +(sum/(d.length/4)).toFixed(1);
      o.max = +mx.toFixed(0);
      o.colors = set.size;
      // 帧指纹：用于判断是否为同一张陈帧
      let h = 0;
      for (let i=0;i<d.length;i+=16){ h = (h*31 + d[i]) >>> 0; }
      o.hash = h;
    }
    const A = window.__narutoAuto;
    if (A && A.vision) {
      o.vs = A.vision.status ? A.vision.status() : 'n/a';
      if (A.probe) { try { o.scene = A.probe().scene; } catch(e){ o.scene='err'; } }
    }
  } catch(e) { o.err = String(e); }
  return JSON.stringify(o);
})()`;

async function connect() {
  const tabs = await getJSON('/json/list');
  const page = tabs.find(t => t.type === 'page' && t.url.includes('start.qq.com'));
  if (!page) throw new Error('未找到游戏页');
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
  return { ws, send };
}

(async () => {
  const { ws, send } = await connect();
  const rows = [];
  console.log(`采样开始: 间隔 ${INTERVAL}s x ${ROUNDS} 次`);
  console.log('时刻      hidden rs  播放 ct      亮度  色数  hash       场景');
  console.log('─'.repeat(76));

  for (let i = 0; i < ROUNDS; i++) {
    try {
      const r = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
      const raw = r?.result?.result?.value;
      if (!raw) { console.log('  无返回'); }
      else {
        const o = JSON.parse(raw);
        const ts = new Date().toTimeString().slice(0,8);
        rows.push({ ts, ...o });
        console.log(
          `${ts}  ${String(o.hidden).padEnd(6)} ${String(o.rs).padEnd(4)} `+
          `${(o.paused?'暂停':'播放').padEnd(5)} ${String(o.ct).padEnd(8)} `+
          `${String(o.avg).padEnd(6)} ${String(o.colors).padEnd(5)} `+
          `${String(o.hash).padEnd(11)} ${o.scene||o.err||''}`
        );
      }
    } catch (e) { console.log('  采样错误:', e.message); }
    if (i < ROUNDS - 1) await new Promise(r => setTimeout(r, INTERVAL * 1000));
  }

  ws.close();
  fs.writeFileSync(OUTFILE, JSON.stringify(rows, null, 2));
  console.log('─'.repeat(76));
  console.log(`原始数据已存: ${OUTFILE}`);

  // 分析
  const ct = rows.map(r => r.ct).filter(x => typeof x === 'number');
  const hashes = rows.map(r => r.hash).filter(x => x != null);
  const scenes = [...new Set(rows.map(r => r.scene).filter(Boolean))];
  console.log('\n=== 分析 ===');
  if (ct.length >= 2) {
    const advancing = ct[ct.length-1] - ct[0];
    console.log(`currentTime 推进: ${advancing.toFixed(1)}s  ${advancing > 1 ? '✅ 帧在更新' : '❌ 帧停滞'}`);
  }
  const uniqHash = new Set(hashes).size;
  console.log(`画面指纹去重: ${uniqHash}/${hashes.length}  ${uniqHash > 1 ? '✅ 画面在变化' : '❌ 全是同一张陈帧'}`);
  console.log(`出现过的场景: ${scenes.join(', ') || '(无)'}`);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
