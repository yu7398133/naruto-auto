// 把游戏画布当前帧抓成 PNG，存到工作区供人工核对。
//
// ⚠ 走 base64 而不是 Array.from(data)：
//   1280x720 RGBA = 3.68M 个数字，CDP 的 returnByValue 序列化这么大的数组会
//   静默失败（实测：进程 exit 0，既无输出也无文件）。base64 字符串小得多且可靠。
const http = require('http');
const fs = require('fs');

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
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.text + ' :: ' +
        ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || ''));
    }
    return r.result.value;
  };

  console.log('抓帧中…');
  const b64 = await ev(`(() => {
    const v = window.__narutoAuto.vision;
    v._fresh();
    const cv = v.ctx.canvas;
    // 用 canvas 自带的 toDataURL —— 浏览器内部编码，不经 JS 数组
    return cv.toDataURL('image/png');
  })()`);

  if (typeof b64 !== 'string' || !b64.startsWith('data:image/png;base64,')) {
    console.log('取帧失败，返回: ' + String(b64).slice(0, 120));
    process.exit(1);
  }
  const png = Buffer.from(b64.split(',')[1], 'base64');
  const out = process.argv[2] || 'live-frame.png';
  fs.writeFileSync(out, png);
  console.log(`已导出 → ${out}（${png.length} 字节）`);

  c.close();
  process.exit(0);
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
