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
    const c = document.createElement('canvas'); c.width=1280; c.height=720;
    c.getContext('2d').drawImage(v,0,0,1280,720);
    return c.toDataURL('image/jpeg',0.92);
  })()`);
  fs.writeFileSync(name, Buffer.from(d.split(',')[1],'base64'));
}

console.log('点前场景:', await scene());
await grab('x0.jpg');

console.log('\n▶ 点【退出战斗】(520,462)');
await evaluate(conn, `window.__narutoAuto.operator.tap(520,462)`, { awaitPromise: true });
await sleep(2000);
console.log('点后场景:', await scene());
await grab('x1-exit.jpg');

// 量退出后的面板上的按钮（确定 / 取消）
const res = await evaluate(conn, `(() => {
  const v = document.querySelector('video');
  const c = document.createElement('canvas'); c.width=1280; c.height=720;
  const g = c.getContext('2d'); g.drawImage(v,0,0,1280,720);
  const d = g.getImageData(0,0,1280,720).data;
  const pts=[];
  for(let y=100;y<660;y++) for(let x=200;x<1100;x++){
    const i=(y*1280+x)*4, r=d[i],gg=d[i+1],b=d[i+2];
    if(r>150&&gg>90&&gg<210&&b<120&&(r-b)>70) pts.push([x,y]);
  }
  return { n:pts.length };
})()`);
console.log('当前面板橙色像素:', res.n);

conn.close();
console.log('\n已存 x0.jpg x1-exit.jpg');
