import { listPages, connect, evaluate } from './cdp.mjs';
import fs from 'node:fs';

const pages = await listPages();
const game = pages.find(p => p.type === 'page' && p.title.includes('火影忍者'));
const conn = await connect(game.webSocketDebuggerUrl);
await conn.send('Runtime.enable');

// ① 场景 + 脚本状态
const st = await evaluate(conn, `(() => {
  const a = window.__narutoAuto;
  const out = { version: (a.config && a.config.get && a.config.get('version')) || null };
  try { out.scene = a.scenes && a.scenes.detect ? JSON.stringify(a.scenes.detect()) : 'no detect'; } catch(e) { out.sceneErr = e.message; }
  try { out.tasks = (a.tasks && a.tasks.list) ? a.tasks.list().length : 'no list'; } catch(e) { out.tasksErr = e.message; }
  try { out.calibActive = a.calib ? a.calib.active : null; } catch(e) {}
  try { out.traceOn = a.trace ? a.trace.on : null; } catch(e) {}
  return out;
})()`);
console.log('=== 脚本状态 ===');
console.log(JSON.stringify(st, null, 2));

// ② 抓当前 video 帧（全尺寸）
const shot = await evaluate(conn, `(() => {
  const v = document.querySelector('video');
  if (!v) return { err: 'no video' };
  const c = document.createElement('canvas');
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);

  // 顺便扫一下左下角（券数候选区）的亮度分布
  const g = c.getContext('2d');
  const px = (x, y) => { const d = g.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; };
  const samples = {};
  for (let y = 600; y <= 710; y += 10) {
    let s = '';
    for (let x = 20; x <= 420; x += 20) {
      const p = px(x, y);
      const l = (p[0]*77 + p[1]*151 + p[2]*28) >> 8;
      s += l > 170 ? 'W' : l > 100 ? '+' : l > 50 ? '-' : '.';
    }
    samples['y' + y] = s;
  }
  return { w: c.width, h: c.height, dataUrl: c.toDataURL('image/jpeg', 0.85), luma: samples };
})()`);

if (shot.err) { console.log('抓帧失败:', shot.err); process.exit(1); }

console.log(`\n=== 抓帧成功 ${shot.w}x${shot.h} ===`);
fs.writeFileSync('shot-now.jpg', Buffer.from(shot.dataUrl.split(',')[1], 'base64'));
console.log('已存 shot-now.jpg  (', fs.statSync('shot-now.jpg').size, 'bytes )');

console.log('\n=== 左下角 x20~420 / y600~710 亮度图 (W=亮 +=中 -=暗 .=黑) ===');
for (const [k, v] of Object.entries(shot.luma)) console.log('  ' + k.padStart(5) + ' ' + v);

conn.close();
