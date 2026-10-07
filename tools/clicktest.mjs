import { listPages, connect, evaluate } from './cdp.mjs';
import fs from 'node:fs';

const pages = await listPages();
const game = pages.find(p => p.type === 'page' && p.title.includes('火影忍者'));
const conn = await connect(game.webSocketDebuggerUrl);
await conn.send('Runtime.enable');

// ① 先看 clickNatural 的实现，确认它真的会发出事件
const src = await evaluate(conn, `(() => {
  const a = window.__narutoAuto;
  const op = a.operator;
  if (!op) return 'no operator';
  const keys = Object.getOwnPropertyNames(Object.getPrototypeOf(op));
  return {
    proto: keys,
    clickNatural: op.clickNatural ? op.clickNatural.toString().slice(0, 900) : 'n/a',
    click: op.click ? op.click.toString().slice(0, 500) : 'n/a',
    tap: op.tap ? op.tap.toString().slice(0, 500) : 'n/a',
  };
})()`);
console.log('=== operator 原型 ===');
console.log(JSON.stringify(src, null, 2));

conn.close();
