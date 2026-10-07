import { listPages, connect, evaluate } from './cdp.mjs';
import fs from 'node:fs';

const pages = await listPages();
const game = pages.find(p => p.type === 'page' && p.title.includes('火影忍者'));
const conn = await connect(game.webSocketDebuggerUrl);
await conn.send('Runtime.enable');

const scene = () => evaluate(conn,
  `(() => { const s = window.__narutoAuto.scenes.detect(); return (s.scene||'?') + '/' + (s.byProbe||'-'); })()`);

console.log('当前场景:', await scene());

// 抓当前帧，并把「左下角那一行」按 4 倍放大裁出来存盘
const out = await evaluate(conn, `(() => {
  const v = document.querySelector('video');
  const c = document.createElement('canvas');
  c.width = 1280; c.height = 720;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(v, 0, 0, 1280, 720);

  // 全图
  const full = c.toDataURL('image/png');

  // 裁剪 + 4x 放大：左下角文字行 x 20~600, y 405~480
  const cw = 580, ch = 75, S = 4;
  const c2 = document.createElement('canvas');
  c2.width = cw * S; c2.height = ch * S;
  const g2 = c2.getContext('2d');
  g2.imageSmoothingEnabled = true;
  g2.imageSmoothingQuality = 'high';
  g2.drawImage(c, 20, 405, cw, ch, 0, 0, cw * S, ch * S);
  const row = c2.toDataURL('image/png');

  return { full, row, w: c2.width, h: c2.height };
})()`);

fs.writeFileSync('row-full.png', Buffer.from(out.full.split(',')[1], 'base64'));
fs.writeFileSync('row-zoom.png', Buffer.from(out.row.split(',')[1], 'base64'));
console.log(`已存 row-full.png, row-zoom.png (${out.w}x${out.h})`);

conn.close();
