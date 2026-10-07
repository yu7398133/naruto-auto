import { listPages, connect, evaluate } from './cdp.mjs';
import fs from 'node:fs';

const NAV = [
  { kind: 'swipe', x1: 973, y1: 299, x2: 12,  y2: 299, dur: 652, dt: 0 },
  { kind: 'swipe', x1: 981, y1: 312, x2: 117, y2: 296, dur: 505, dt: 1265 },
  { kind: 'tap',   x: 614, y: 403, dt: 1999 },
  { kind: 'tap',   x: 79,  y: 329, dt: 5356 },
  { kind: 'tap',   x: 949, y: 531, dt: 3568 },
];

const pages = await listPages();
const game = pages.find(p => p.type === 'page' && p.title.includes('火影忍者'));
const conn = await connect(game.webSocketDebuggerUrl);
await conn.send('Runtime.enable');

const sleep = ms => new Promise(s => setTimeout(s, ms));

const shot = async (name) => {
  const d = await evaluate(conn, `(() => {
    const v = document.querySelector('video');
    const c = document.createElement('canvas');
    c.width = 1280; c.height = 720;
    c.getContext('2d').drawImage(v, 0, 0, 1280, 720);
    return c.toDataURL('image/jpeg', 0.85);
  })()`);
  fs.writeFileSync(name, Buffer.from(d.split(',')[1], 'base64'));
};

const scene = () => evaluate(conn,
  `(() => { const s = window.__narutoAuto.scenes.detect(); return (s.scene||'?') + '/' + (s.byProbe||'-'); })()`);

console.log('起始场景:', await scene());
await shot('nav-00-start.jpg');

for (let i = 0; i < NAV.length; i++) {
  const st = NAV[i];
  if (i > 0 && st.dt > 0) { console.log(`   ⏳ 等 ${st.dt}ms`); await sleep(st.dt); }

  if (st.kind === 'swipe') {
    console.log(`▶ ${i + 1}/${NAV.length} 拖屏 (${st.x1},${st.y1})→(${st.x2},${st.y2}) ${st.dur}ms`);
    await evaluate(conn,
      `window.__narutoAuto.operator.swipe(${st.x1},${st.y1},${st.x2},${st.y2},${st.dur})`,
      { awaitPromise: true });
  } else {
    console.log(`▶ ${i + 1}/${NAV.length} 点击 (${st.x},${st.y})`);
    await evaluate(conn,
      `window.__narutoAuto.operator.tap(${st.x},${st.y})`,
      { awaitPromise: true });
  }

  await sleep(1200);
  const s = await scene();
  const f = `nav-0${i + 1}.jpg`;
  await shot(f);
  console.log(`   场景=${s}  已存 ${f}`);
}

conn.close();
console.log('\n导航完成。');
