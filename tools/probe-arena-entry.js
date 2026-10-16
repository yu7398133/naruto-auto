// 一次性取证：把「奖励面板入口」这个坐标在**准备界面**上到底压在什么位置拍下来。
//
// 背景（2026-10-16）：忍术对战每批最后一局后要打开奖励面板再领奖。
//   ARENA_REWARD_ENTRY = [793,642]（1280x720 脚本坐标）
//   实测 14:46:12 click(795,643) 之后画面变成**主界面**，不是奖励面板。
//   怀疑坐标已经失效（点到了"返回/离开"类按钮）。
//
// 本脚本不改任何判据，只做两件事：
//   ① 打印当前五块亮度 + 场景（对照基线）
//   ② 把 (793,642) 周围 120x120 区域导成放大 PNG，人眼确认那是什么
//
// ⚠ 只在**用户确认当前处于准备界面**时才有意义。当前是主界面，所以先只做基线。
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

  // ① 当前场景 + 对照读数
  const base = await ev(`(() => {
    const A = window.__narutoAuto, v = A.vision;
    v._fresh();
    const sd = A.scenes.detect(false);
    const p = A.probes || {};
    const q = (k) => { try { const r = v.match(p[k]); return r ? r.dist + '/' + r.tol : 'n/a'; } catch(e){ return 'err'; } };
    return JSON.stringify({ scene: sd.scene, brightness: sd.brightness,
      closeX: q('closeX'), friendsIcon: q('friendsIcon') }, null, 1);
  })()`);
  console.log('=== 当前状态基线 ===');
  console.log(base);

  // ② 导出以脚本坐标 (793,642) 为中心的一块，带十字准星标记
  const b64 = await ev(`(() => {
    const A = window.__narutoAuto, v = A.vision;
    v._fresh();
    const cv = v.ctx.canvas;
    const X = 793, Y = 642, R = 140;
    const sx = Math.max(0, X - R), sy = Math.max(0, Y - R);
    const w = Math.min(cv.width - sx, R * 2), h = Math.min(cv.height - sy, R * 2);
    // 拷到临时 canvas 并放大 3 倍，画出十字准星
    const tmp = document.createElement('canvas');
    tmp.width = w * 3; tmp.height = h * 3;
    const tc = tmp.getContext('2d');
    tc.imageSmoothingEnabled = false;
    tc.drawImage(cv, sx, sy, w, h, 0, 0, w * 3, h * 3);
    tc.strokeStyle = '#ff0000'; tc.lineWidth = 3;
    tc.beginPath();
    tc.moveTo((X - sx) * 3 - 30, (Y - sy) * 3); tc.lineTo((X - sx) * 3 + 30, (Y - sy) * 3);
    tc.moveTo((X - sx) * 3, (Y - sy) * 3 - 30); tc.lineTo((X - sx) * 3, (Y - sy) * 3 + 30);
    tc.stroke();
    return tmp.toDataURL('image/png');
  })()`);
  const png = Buffer.from(b64.split(',')[1], 'base64');
  fs.writeFileSync('entry-793-642.png', png);
  console.log(`\n已导出 (793,642) 邻域放大图 → entry-793-642.png（${png.length} 字节）`);

  c.close();
  process.exit(0);
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
