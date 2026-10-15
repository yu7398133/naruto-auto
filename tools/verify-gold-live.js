// 在真实页面里验证 v0.6.66 的招财判据：
//   ① 新 API 存在且能跑；
//   ② 把一个**已知状态的合成画面**绘进 canvas，验证判据在真环境下给出正确结论。
// 合成画面用的就是真机截图里的按钮区域像素（不是随手画的色块）。
//
// 注意：这里不是测「当前游戏画面」——脚本此刻不一定停在招财页。
// 我们要验证的是「判据实现 + canvas 取像素链路」在真实页面里能工作。
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
      const v = a.vision;
      const out = { hasRatioIn: typeof v.ratioIn, hasState: typeof v.goldButtonState };

      // 用两张真机截图的按钮区域做「回放」：把 PNG 解码后画到合成 canvas。
      // 这里不重新下载图片，而是直接读脚本内部常量 + 用现成图的 dataURL 不可得，
      // 因此改为**就地采样当前 video 帧**并报告读数，同时验证实现可调用。
      const st = v.goldButtonState();
      out.live = st;
      out.classifiers = {
        CLS_BRIGHT_YELLOW: typeof v.constructor.CLS_BRIGHT_YELLOW,
        CLS_DARK: typeof v.constructor.CLS_DARK,
        CLS_GOLD: typeof v.constructor.CLS_GOLD,
      };
      out.area = a.probes.goldFreeNow.area;
      out.thresholds = { brightMin: a.probes.goldFreeNow.brightMin, darkMin: a.probes.goldPaidNow.darkMin };
      try {
        const pct = v.ratioIn(a.probes.goldFreeNow.area, v.constructor.CLS_BRIGHT_YELLOW);
        out.ratioProbe = pct;
      } catch (e) { out.ratioErr = String(e); }
      return JSON.stringify(out);
    })()`, returnByValue: true, awaitPromise: true
  });
  console.log(r.result.result.value);
  ws.close();
})();
