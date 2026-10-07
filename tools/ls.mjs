import { listPages } from './cdp.mjs';
const ps = await listPages();
for (const p of ps) {
  console.log(p.type, '|', (p.title || '').slice(0, 36), '|', (p.url || '').slice(0, 100));
  if (p.webSocketDebuggerUrl) console.log('    ws:', p.webSocketDebuggerUrl.slice(0, 70));
}
