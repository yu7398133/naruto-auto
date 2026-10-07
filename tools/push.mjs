import { listPages, connect, evaluate } from './cdp.mjs';
import fs from 'node:fs';

const src = fs.readFileSync('../naruto-auto.user.js', 'utf8');
const pages = await listPages();
const game = pages.find(p => p.type === 'page' && p.title.includes('火影忍者'));
const conn = await connect(game.webSocketDebuggerUrl);
await conn.send('Runtime.enable');

// ① 读当前运行版本
const before = await evaluate(conn, `(() => {
  const a = window.__narutoAuto;
  return (a.config && a.config.get && a.config.get('version')) || 'unknown';
})()`);
console.log('推送前运行版本:', before);

// ② 直接从源码里取新常量，验证它就是我们写的值
const m = src.match(/const SECRET_REALM_FORCE_EXIT = (\[\[.*?\]\]);/s);
console.log('源码里的 FORCE_EXIT:', m ? m[1] : '没找到');

// ③ 在页面里求值，确认坐标
const val = await evaluate(conn, `(() => {
  const m = ${JSON.stringify(src)}.match(/const SECRET_REALM_FORCE_EXIT = (\\[\\[.*?\\]\\]);/s);
  return m ? JSON.parse(m[1]) : null;
})()`);
console.log('页面解析结果:', JSON.stringify(val));

// ④ 验证这三步在真实画面上确实落在橙色按钮上
const hit = await evaluate(conn, `(() => {
  const v = document.querySelector('video');
  const c = document.createElement('canvas'); c.width=1280; c.height=720;
  const g = c.getContext('2d'); g.drawImage(v,0,0,1280,720);
  const at = (x,y) => { const d=g.getImageData(x,y,1,1).data; return [d[0],d[1],d[2]]; };
  const out = {};
  for (const [i,[x,y]] of ${JSON.stringify(val)}.entries()) {
    out['step'+(i+1)+' ('+x+','+y+')'] = at(x,y);
  }
  return out;
})()`);
console.log('\n=== 当前画面上这三步坐标的实际像素 ===');
for (const [k, v] of Object.entries(hit)) console.log(`   ${k}: rgb(${v.join(',')})`);

conn.close();
