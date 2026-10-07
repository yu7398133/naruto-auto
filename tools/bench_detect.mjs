import { listPages, connect, evaluate } from './cdp.mjs';

const pages = await listPages();
const g = pages.find(p => p.url && (p.url.includes('start.qq.com') || p.url.includes('game')));
if (!g) { console.log('未找到游戏页。页面数:', pages.length); process.exit(0); }
console.log('目标页:', (g.title || '').slice(0, 40), '|', g.url.slice(0, 70));

const conn = await connect(g.webSocketDebuggerUrl);
const hasApi = await evaluate(conn, 'typeof window.__narutoAuto');
console.log('window.__narutoAuto:', hasApi);
if (hasApi === 'undefined') { console.log('脚本未注入 —— 需要刷新页面'); process.exit(0); }

// 测 scenes.detect 单次耗时
const r = await evaluate(conn, `(() => {
  const A = window.__narutoAuto;
  const sc = A.scenes || (A.ctx && A.ctx.scenes) || (A.runtime && A.runtime.scenes);
  if (!sc) return 'no scenes';
  const N = 30, ts = [];
  for (let i = 0; i < N; i++) {
    const t = performance.now();
    sc.detect(false);
    ts.push(performance.now() - t);
  }
  ts.sort((a,b)=>a-b);
  return JSON.stringify({
    n: N,
    min: +ts[0].toFixed(1),
    p50: +ts[Math.floor(N/2)].toFixed(1),
    p95: +ts[Math.floor(N*0.95)].toFixed(1),
    max: +ts[N-1].toFixed(1),
    avg: +(ts.reduce((a,b)=>a+b,0)/N).toFixed(1)
  });
})()`);
console.log('detect 耗时(ms):', r);

// 测 capture 单次耗时
const r2 = await evaluate(conn, `(() => {
  const A = window.__narutoAuto;
  const v = A.vision || (A.ctx && A.ctx.vision);
  if (!v || !v.capture) return 'no vision';
  const N = 20, ts = [];
  for (let i = 0; i < N; i++) {
    const t = performance.now();
    try { v.capture(true); } catch (e) { return 'capture err: ' + e.message; }
    ts.push(performance.now() - t);
  }
  ts.sort((a,b)=>a-b);
  return JSON.stringify({ p50: +ts[Math.floor(N/2)].toFixed(1), max: +ts[N-1].toFixed(1) });
})()`);
console.log('capture(force) 耗时(ms):', r2);
