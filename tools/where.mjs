import { listPages, connect, evaluate } from './cdp.mjs';
import fs from 'node:fs';
const pages = await listPages();
const game = pages.find(p => p.type === 'page' && p.title.includes('火影忍者'));
const conn = await connect(game.webSocketDebuggerUrl);
await conn.send('Runtime.enable');

const st = await evaluate(conn, `(() => {
  const a = window.__narutoAuto;
  const s = a.scenes.detect();
  const o = { scene: s.scene, byProbe: s.byProbe, brightness: s.brightness, hits: {} };
  for (const [k, v] of Object.entries(s.hits || {})) {
    if (v && v.ok) o.hits[k] = { dist: v.dist, clickPoint: v.clickPoint || null };
  }
  return o;
})()`);
console.log('场景:', st.scene, '/', st.byProbe, ' 亮度', st.brightness);
console.log('命中探针:', JSON.stringify(st.hits));

const d = await evaluate(conn, `(() => {
  const v = document.querySelector('video');
  const c = document.createElement('canvas');
  c.width = 1280; c.height = 720;
  c.getContext('2d').drawImage(v, 0, 0, 1280, 720);
  return c.toDataURL('image/jpeg', 0.92);
})()`);
fs.writeFileSync('now.jpg', Buffer.from(d.split(',')[1], 'base64'));
console.log('已存 now.jpg');
conn.close();
