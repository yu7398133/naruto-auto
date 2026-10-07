import { listPages, connect, evaluate } from './cdp.mjs';

const pages = await listPages();
const game = pages.find(p => p.type === 'page' && p.title.includes('火影忍者'));
const conn = await connect(game.webSocketDebuggerUrl);
await conn.send('Runtime.enable');

const src = await evaluate(conn, `(() => {
  const op = window.__narutoAuto.operator;
  const sdk = op.sdk;
  const out = {
    swipe: op.swipe ? op.swipe.toString().slice(0, 1200) : 'n/a',
    sdkKeys: sdk ? Object.keys(sdk) : 'no sdk',
    sdkProto: sdk ? Object.getOwnPropertyNames(Object.getPrototypeOf(sdk)) : 'no sdk',
    sdkReady: sdk ? sdk.ready : null,
  };
  if (sdk) {
    out._map = sdk._map ? sdk._map.toString().slice(0, 400) : 'n/a';
    out._down = sdk._down ? sdk._down.toString().slice(0, 400) : 'n/a';
    out._move = sdk._move ? sdk._move.toString().slice(0, 400) : 'n/a';
    out._up   = sdk._up   ? sdk._up.toString().slice(0, 400)   : 'n/a';
  }
  return out;
})()`);
console.log(JSON.stringify(src, null, 2));
conn.close();
