import { listPages, connect, evaluate } from './cdp.mjs';
import fs from 'node:fs';
const pages = await listPages();
const game = pages.find(p => p.type === 'page' && p.title.includes('火影忍者'));
const conn = await connect(game.webSocketDebuggerUrl);
await conn.send('Runtime.enable');
const sleep = ms => new Promise(s => setTimeout(s, ms));
async function grab(name){
  const d = await evaluate(conn,`(()=>{const v=document.querySelector('video');const c=document.createElement('canvas');c.width=1280;c.height=720;c.getContext('2d').drawImage(v,0,0,1280,720);return c.toDataURL('image/jpeg',0.92);})()`);
  fs.writeFileSync(name, Buffer.from(d.split(',')[1],'base64'));
}

// ① 右上角暂停（脚本定义 closeGray click=[1238,46]）
console.log('① 点暂停 (1238,46)');
await evaluate(conn, `window.__narutoAuto.operator.tap(1238,46)`, { awaitPromise: true });
await sleep(2000);
await grab('r1.jpg');

// ② 退出战斗（左下橙色 = 521,464）
console.log('② 点退出战斗 (521,464)');
await evaluate(conn, `window.__narutoAuto.operator.tap(521,464)`, { awaitPromise: true });
await sleep(2000);
await grab('r2.jpg');

// ③ 确定（弹窗左下橙色）
console.log('③ 点确定 (521,464)');
await evaluate(conn, `window.__narutoAuto.operator.tap(521,464)`, { awaitPromise: true });
await sleep(4000);
await grab('r3.jpg');
console.log('已存 r1 r2 r3');

conn.close();
