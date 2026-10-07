import { listPages, connect, evaluate } from './cdp.mjs';
import fs from 'node:fs';

const outFile = process.argv[2] || 'frame.png';
const pages = await listPages();
const game = pages.find(p => p.type === 'page' && /start\.qq\.com/.test(p.url || ''));
if (!game) { console.log('NO_GAME_PAGE'); process.exit(1); }

const conn = await connect(game.webSocketDebuggerUrl);
await conn.send('Runtime.enable');

const r = await evaluate(conn, `(() => {
  const v = document.querySelector('video');
  if (!v) return { err: 'no video' };
  const c = document.createElement('canvas');
  c.width = v.videoWidth; c.height = v.videoHeight;
  const g = c.getContext('2d');
  g.drawImage(v, 0, 0);
  return { w: c.width, h: c.height, data: c.toDataURL('image/png') };
})()`);

if (r.err) { console.log('ERR:', r.err); process.exit(1); }
const b64 = r.data.split(',')[1];
fs.writeFileSync(outFile, Buffer.from(b64, 'base64'));
console.log(`OK ${r.w}x${r.h} -> ${outFile} (${fs.statSync(outFile).size} bytes)`);
process.exit(0);
