import { listPages, connect, evaluate } from './cdp.mjs';
import fs from 'node:fs';

const pages = await listPages();
const game = pages.find(p => p.type === 'page' && p.title.includes('火影忍者'));
const conn = await connect(game.webSocketDebuggerUrl);
await conn.send('Runtime.enable');
const sleep = ms => new Promise(s => setTimeout(s, ms));

const scene = () => evaluate(conn,
  `(() => { const s = window.__narutoAuto.scenes.detect(); return (s.scene||'?') + '/' + (s.byProbe||'-'); })()`);

async function grab(name) {
  const d = await evaluate(conn, `(() => {
    const v = document.querySelector('video');
    const c = document.createElement('canvas');
    c.width = 1280; c.height = 720;
    c.getContext('2d').drawImage(v, 0, 0, 1280, 720);
    return c.toDataURL('image/jpeg', 0.92);
  })()`);
  fs.writeFileSync(name, Buffer.from(d.split(',')[1], 'base64'));
}

console.log('=== 开始：准备界面 ===');
console.log('场景:', await scene());
await grab('t0-prepare.jpg');

// 点挑战按钮 (1165,587) —— 就是 NAV 第6步
console.log('\n▶ 点击挑战按钮 (1165,587)');
await evaluate(conn, `window.__narutoAuto.operator.tap(1165, 587)`, { awaitPromise: true });

for (const [ms, tag] of [[3000,'t1'],[5000,'t2'],[10000,'t3'],[15000,'t4']]) {
  await sleep(ms);
  await grab(`${tag}.jpg`);
  console.log(`  ${tag} (+${ms}ms) 场景=${await scene()}`);
}

await sleep(30000);
await grab('t5.jpg');
console.log('  t5 (+30s) 场景=' + await scene());

await sleep(60000);
await grab('t6.jpg');
console.log('  t6 (+90s) 场景=' + await scene());

conn.close();
console.log('\n完成，帧已存 t0~t6');
