import { listPages, connect, evaluate } from './cdp.mjs';

const pages = await listPages();
const game = pages.find(p => p.type === 'page' && p.title.includes('火影忍者'));
const conn = await connect(game.webSocketDebuggerUrl);
await conn.send('Runtime.enable');

// 用脚本自己的 toLogical 反向求：逻辑坐标 (x,y) → 浏览器 client 坐标
const r = await evaluate(conn, `(() => {
  const a = window.__narutoAuto;
  const el = a.vision.video || document.querySelector('video');
  const rct = el.getBoundingClientRect();
  const sw = el.videoWidth || 1280, sh = el.videoHeight || 720;
  const scale = Math.min(rct.width / sw, rct.height / sh);
  const offX = (rct.width - sw * scale) / 2, offY = (rct.height - sh * scale) / 2;

  const toClient = (lx, ly) => ({
    cx: Math.round(rct.left + offX + lx * (sw / 1280) * scale),
    cy: Math.round(rct.top  + offY + ly * (sh / 720)  * scale),
  });

  const out = {
    rect: { w: Math.round(rct.width), h: Math.round(rct.height), left: Math.round(rct.left), top: Math.round(rct.top) },
    video: { sw, sh },
    scale: +scale.toFixed(4),
    offX: Math.round(offX), offY: Math.round(offY),
    // 验证：脚本自己的 toLogical 往返
    probes: {},
  };
  // 拿 calib 的 toLogical 反算校验
  for (const [lx, ly] of [[0,0],[1280,720],[640,360],[1165,587],[79,329]]) {
    const p = toClient(lx, ly);
    let back = null;
    try { back = a.calib.toLogical(p.cx, p.cy); } catch(e) { back = 'err:' + e.message; }
    out.probes[lx + ',' + ly] = { client: [p.cx, p.cy], backToLogical: back };
  }
  return out;
})()`);

console.log(JSON.stringify(r, null, 2));
conn.close();
