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

// 量右上角那一块到底是什么颜色
const probe = await evaluate(conn, `(() => {
  const v = document.querySelector('video');
  const c = document.createElement('canvas');
  c.width = 1280; c.height = 720;
  const g = c.getContext('2d');
  g.drawImage(v, 0, 0, 1280, 720);
  const out = {};
  const box = (x0,y0,x1,y1,tag) => {
    const d = g.getImageData(x0,y0,x1-x0,y1-y0).data;
    let r=0,gg=0,b=0,n=0, mn=999, mx=-1;
    for (let i=0;i<d.length;i+=4){ r+=d[i]; gg+=d[i+1]; b+=d[i+2]; n++;
      const l=(d[i]+d[i+1]+d[i+2])/3; if(l<mn)mn=l; if(l>mx)mx=l; }
    out[tag] = { avg:[Math.round(r/n),Math.round(gg/n),Math.round(b/n)], minL:Math.round(mn), maxL:Math.round(mx) };
  };
  box(1212,21,1263,70,'closeGray区(脚本定义)');
  box(1190,20,1230,60,'我猜的暂停区');
  return out;
})()`);
console.log('=== 右上角区域实测 ===');
console.log(JSON.stringify(probe, null, 2));

console.log('\n场景(点前):', await scene());
await grab('q0.jpg');

console.log('\n▶ 点脚本定义的 (1238,46)');
await evaluate(conn, `window.__narutoAuto.operator.tap(1238, 46)`, { awaitPromise: true });
await sleep(2000);
console.log('场景(点后):', await scene());
await grab('q1.jpg');

conn.close();
