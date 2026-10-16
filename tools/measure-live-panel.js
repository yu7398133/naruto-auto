// 趁用户**正开着奖励面板**，直接从游戏画布抓当前帧，实测五块亮度。
//
// 这是决定性证据：同一个画面，脚本自己看到的读数是什么。
// 如果面板开着但读出来是 100/92/55/30/79，那就是判据/采样点的问题；
// 如果读出来是暗的，那失败现场那张截图确实是另一个界面。
const http = require('http');

const get = (path) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path }, r => {
    let d = ''; r.on('data', c => d += c);
    r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { res(d); } });
  }).on('error', rej);
});

function cdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0; const pend = new Map();
    const send = (method, params) => new Promise((res, rej) => {
      const i = ++id; pend.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params: params || {} }));
    });
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pend.has(m.id)) {
        const p = pend.get(m.id); pend.delete(m.id);
        if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result);
      }
    };
    ws.onerror = () => reject(new Error('ws error'));
    ws.onopen = () => resolve({ send, close: () => ws.close() });
  });
}

(async () => {
  const list = await get('/json/list');
  const t = list.find(x => x.type === 'page' && /start\.qq\.com/.test(x.url));
  if (!t) { console.log('未找到游戏页'); process.exit(1); }
  await get('/json/activate/' + t.id).catch(() => {});
  const c = await cdp(t.webSocketDebuggerUrl);

  const ev = async (expr) => {
    const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' +
      ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || ''));
    return r.result.value;
  };

  // 直接复用脚本自己的判据：standard④（面板是否打开）
  const report = await ev(`(() => {
    const A = window.__narutoAuto;
    const v = A.vision;
    const out = { steps: [] };
    try {
      v._fresh();
      const cv = v.ctx.canvas;
      out.canvas = cv.width + 'x' + cv.height;
      // 逐块算亮度（脚本坐标 = 画布坐标，1280x720 基准）
      const AREAS = ${JSON.stringify([[10,30,120,100],[1160,30,1270,100],[10,620,120,700],[10,300,60,450],[1220,300,1270,450]])};
      out.blocks = AREAS.map(a => {
        const w = a[2]-a[0], h = a[3]-a[1];
        const d = v.ctx.getImageData(a[0], a[1], w, h).data;
        let s = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { s += (d[i]*77 + d[i+1]*151 + d[i+2]*28) >> 8; n++; }
        return Math.round(s / n);
      });
      out.dark = out.blocks.filter(x => x <= 80).length;
      // 场景判定
      const sd = A.scenes.detect(false);
      out.scene = sd.scene;
      out.brightness = sd.brightness;
    } catch (e) { out.err = e.message + ' | ' + e.stack; }
    return JSON.stringify(out, null, 2);
  })()`);

  console.log('=== 当前画布实测 ===');
  console.log(report);

  c.close();
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
