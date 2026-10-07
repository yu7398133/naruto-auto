import { listPages, connect, evaluate } from './cdp.mjs';
import fs from 'fs';

const pages = await listPages();
const g = pages.find(p => p.type === 'page' && /arm-game|start\.qq\.com/.test(p.url || ''));
const conn = await connect(g.webSocketDebuggerUrl);

// 1) 当前场景
const sc = await evaluate(conn, `(() => {
  const r = window.__narutoAuto.scenes.detect(false);
  return { scene: r.scene, brightness: r.brightness };
})()`, { awaitPromise: true });
console.log('场景:', JSON.stringify(sc));

// 2) canvas 尺寸信息（确认缩放链路）
const info = await evaluate(conn, `(() => {
  const v = window.__narutoAuto.vision;
  return { hasCanvas: !!v.canvas, w: v.canvas && v.canvas.width, h: v.canvas && v.canvas.height };
})()`, { awaitPromise: true });
console.log('vision canvas:', JSON.stringify(info));

// 3) 抓当前帧存盘
const b64 = await evaluate(conn, `(() => {
  const v = window.__narutoAuto.vision;
  v._fresh && v._fresh();
  return v.canvas.toDataURL('image/jpeg', 0.9);
})()`, { awaitPromise: true });
if (typeof b64 === 'string' && b64.startsWith('data:')) {
  const buf = Buffer.from(b64.split(',')[1], 'base64');
  const out = 'C:/Users/chenyu/dsh/火影忍者/tools/live-now.jpg';
  fs.writeFileSync(out, buf);
  console.log('已存帧:', out, buf.length, 'B');
} else {
  console.log('抓帧失败:', JSON.stringify(b64).slice(0, 200));
}
conn.close();
