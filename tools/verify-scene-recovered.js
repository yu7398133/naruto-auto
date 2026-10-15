// v0.6.67 验证：场景检测是否恢复。
// 事故期间 detect() 每轮抛异常 → scene 恒为 other、error 非空。
// 修复后应能正常返回场景，且 error 为空。
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const get = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
const put = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p, method: 'PUT' }, r => { r.resume(); r.on('end', res); }).on('error', rej);
});
function conn(u) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(u); let id = 0; const pend = new Map();
    ws.addEventListener('message', e => { const j = JSON.parse(e.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
    ws.addEventListener('open', () => resolve({ ws, send: (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); }) }));
    ws.addEventListener('error', reject);
  });
}
(async () => {
  const l = await get('/json/list');
  const t = l.find(x => x.url.includes('start.qq.com/game'));
  if (!t) { console.log('未找到游戏页'); return; }
  await put('/json/activate/' + t.id);
  await sleep(800);
  const { ws, send } = await conn(t.webSocketDebuggerUrl);

  const r = await send('Runtime.evaluate', {
    expression: `(async () => {
      const a = window.__narutoAuto;
      // 连测 3 次，确认稳定（不是碰巧某一次不抛）
      const runs = [];
      for (let i = 0; i < 3; i++) {
        const d = a.scenes.detect(false);
        runs.push({ scene: d.scene, byProbe: d.byProbe || null, error: d.error || null,
                    bright: d.brightness, hits: Object.keys(d.hits || {}).length });
        await new Promise(z => setTimeout(z, 700));
      }
      return JSON.stringify({ runs, visionLastError: a.vision.lastError || null, stats: a.vision.stats }, null, 1);
    })()`, returnByValue: true, awaitPromise: true
  });
  console.log(r.result.result.value);
  ws.close();
})();
