import { listPages, connect, evaluate } from './cdp.mjs';
import fs from 'node:fs';
const pages = await listPages();
const game = pages.find(p => p.type === 'page' && p.title.includes('火影忍者'));
const conn = await connect(game.webSocketDebuggerUrl);
await conn.send('Runtime.enable');
const sleep = ms => new Promise(s => setTimeout(s, ms));

// 取管理层『与上层不同』的判据：中央文字行的白像素分布
async function sig() {
  return evaluate(conn, `(() => {
    const v = document.querySelector('video');
    const c = document.createElement('canvas'); c.width=1280; c.height=720;
    const g = c.getContext('2d'); g.drawImage(v,0,0,1280,720);
    const d = g.getImageData(300,250,680,140).data;  // 弹窗标题区
    let white=0; for(let i=0;i<d.length;i+=4){ if(d[i]>200&&d[i+1]>200&&d[i+2]>200) white++; }
    return white;
  })()`);
}
async function grab(name){
  const d = await evaluate(conn,`(()=>{const v=document.querySelector('video');const c=document.createElement('canvas');c.width=1280;c.height=720;c.getContext('2d').drawImage(v,0,0,1280,720);return c.toDataURL('image/jpeg',0.92);})()`);
  fs.writeFileSync(name, Buffer.from(d.split(',')[1],'base64'));
}

console.log('当前白字数(标题区):', await sig());
await grab('s0.jpg');

console.log('\n▶ 点左边按钮 (521,464)');
await evaluate(conn, `window.__narutoAuto.operator.tap(521,464)`, { awaitPromise: true });
await sleep(2500);
console.log('之后白字数:', await sig());
await grab('s1.jpg');

console.log('\n▶ 再点左边 (521,464)');
await evaluate(conn, `window.__narutoAuto.operator.tap(521,464)`, { awaitPromise: true });
await sleep(3000);
console.log('之后白字数:', await sig());
await grab('s2.jpg');

conn.close();
