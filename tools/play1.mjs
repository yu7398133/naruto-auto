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

console.log('▶ 点匹配/挑战 (1165,587)');
await evaluate(conn, `window.__narutoAuto.operator.tap(1165,587)`, { awaitPromise: true });
await sleep(4000);
await grab('b1.jpg');
console.log('  4s 后已存 b1.jpg');

await sleep(10000);
await grab('b2.jpg');
console.log('  14s 已存 b2.jpg');

conn.close();
