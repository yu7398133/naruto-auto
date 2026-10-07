import { listPages, connect, evaluate } from './cdp.mjs';
import fs from 'node:fs';

const pages = await listPages();
const game = pages.find(p => p.type === 'page' && p.title.includes('火影忍者'));
const conn = await connect(game.webSocketDebuggerUrl);
await conn.send('Runtime.enable');

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

console.log('场景:', await scene());
await grab('p0.jpg');

// 扫描全图金色像素，按行聚类找按钮带
const gold = await evaluate(conn, `(() => {
  const v = document.querySelector('video');
  const c = document.createElement('canvas');
  c.width = 1280; c.height = 720;
  const g = c.getContext('2d');
  g.drawImage(v, 0, 0, 1280, 720);
  const d = g.getImageData(0, 0, 1280, 720).data;
  const pts = [];
  for (let y = 0; y < 720; y++) {
    for (let x = 0; x < 1280; x++) {
      const i = (y*1280+x)*4;
      const r=d[i], gg=d[i+1], b=d[i+2];
      if (r>160 && gg>110 && b<140 && (r-b)>60) pts.push([x,y]);
    }
  }
  // 按 y 分桶（10px 一档），找密集带
  const rows = {};
  for (const [x,y] of pts) rows[y] = (rows[y]||0)+1;
  const bands = {};
  for (const [y,n] of Object.entries(rows)) {
    const k = Math.floor(y/10)*10;
    bands[k] = (bands[k]||0)+n;
  }
  const topBands = Object.entries(bands).sort((a,b)=>b[1]-a[1]).slice(0,10);
  return { total: pts.length, topBands };
})()`);
console.log('\n=== 全图金色像素 ===');
console.log('总数:', gold.total);
console.log('金色最密集的行带 (y, 数量):');
for (const [y, n] of gold.topBands) console.log(`   y ${y}~${+y+9}: ${n}`);

conn.close();
console.log('\n已存 p0.jpg');
