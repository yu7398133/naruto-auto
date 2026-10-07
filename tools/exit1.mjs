import { listPages, connect, evaluate } from './cdp.mjs';
import fs from 'node:fs';
const pages = await listPages();
const game = pages.find(p => p.type === 'page' && p.title.includes('火影忍者'));
const conn = await connect(game.webSocketDebuggerUrl);
await conn.send('Runtime.enable');
const sleep = ms => new Promise(s => setTimeout(s, ms));

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
const scene = () => evaluate(conn,
  `(() => { const s = window.__narutoAuto.scenes.detect(); return (s.scene||'?') + '/' + (s.byProbe||'-'); })()`);

console.log('=== ① 点前 ===');
console.log('场景:', await scene());
await grab('e0.jpg');

console.log('\n▶ 点右上角暂停 (1207,61)');
await evaluate(conn, `window.__narutoAuto.operator.tap(1207, 61)`, { awaitPromise: true });
await sleep(1800);
console.log('场景:', await scene());
await grab('e1-pause.jpg');

// 测量金色按钮（暂停菜单里的「退出游戏」）
const gold = await evaluate(conn, `(() => {
  const v = document.querySelector('video');
  const c = document.createElement('canvas');
  c.width = 1280; c.height = 720;
  const g = c.getContext('2d');
  g.drawImage(v, 0, 0, 1280, 720);
  const d = g.getImageData(0, 0, 1280, 720).data;
  // 金色：R高 G中 B低，饱和高
  let minx=1e9,miny=1e9,maxx=-1,maxy=-1,n=0;
  const mask = [];
  for (let y = 200; y < 620; y++) {
    for (let x = 300; x < 1000; x++) {
      const i = (y*1280+x)*4;
      const r=d[i],gg=d[i+1],b=d[i+2];
      if (r>170 && gg>120 && b<130 && (r-b)>70) {
        n++;
        if(x<minx)minx=x; if(x>maxx)maxx=x;
        if(y<miny)miny=y; if(y>maxy)maxy=y;
        mask.push([x,y]);
      }
    }
  }
  // 按行分簇，找水平按钮带
  const rows = {};
  for (const [x,y] of mask) { rows[y] = (rows[y]||0)+1; }
  const top = Object.entries(rows).sort((a,b)=>b[1]-a[1]).slice(0,10);
  return { n, bbox:[minx,miny,maxx,maxy], topRows: top };
})()`);
console.log('\n=== 金色像素测量（暂停菜单）===');
console.log(JSON.stringify(gold));

conn.close();
