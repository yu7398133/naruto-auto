// 逐键重发：单键 W，按住更久，可选多种 action 值
// 用法: node one2.mjs <action> <holdMs> <keyCode...>
//   node one2.mjs 60 2500 87
import { listPages, connect } from './cdp.mjs';
const ps = await listPages();
const game = ps.find(p => (p.url || '').includes('arm-game'));
const conn = await connect(game.webSocketDebuggerUrl);
const BOOT = `
if(!window.__probe_req)window.webpackChunk_app_arm_game.push([[Symbol('p')],{},function(r){window.__probe_req=r;}]);
if(!window.__inputSdk) window.__inputSdk = window.__probe_req('47860');
window.__SEND = function(kc, act){
  const kb = window.__inputSdk.R.pc.keyboard;
  const ch = kc >= 32 && kc < 127 ? String.fromCharCode(kc).toLowerCase() : '';
  const ev = { keyCode:kc, key:ch, code:'Key'+ch.toUpperCase(), repeat:false, location:0,
               ctrlKey:false, metaKey:false, altKey:false, shiftKey:false,
               getModifierState:function(){return false}, preventDefault:function(){} };
  return kb.sendKeyEvent(ev, act, true);
};
`;

const act = Number(process.argv[2] || 60);
const hold = Number(process.argv[3] || 2500);
const keys = (process.argv.slice(4).length ? process.argv.slice(4) : ['87']).map(Number);

const expr = `(async function(){
  ${BOOT}
  const sleep = (ms) => new Promise(r=>setTimeout(r,ms));
  const log = [];
  try {
    log.push('down act=${act} keys=${keys.join(',')}');
    ${keys.map(k => `window.__SEND(${k}, ${act});`).join('\n    ')}
    await sleep(${hold});
    log.push('up act=${act + 1}');
    ${keys.slice().reverse().map(k => `window.__SEND(${k}, ${act + 1});`).join('\n    ')}
    return JSON.stringify({ ok: true, log });
  } catch(e) { return JSON.stringify({ err: e.message, log }); }
})()`;

const r = await conn.send('Runtime.evaluate', {
  expression: expr, returnByValue: true, awaitPromise: true,
  includeCommandLineAPI: true, userGesture: true,
});
console.log(r.exceptionDetails
  ? 'EXC ' + (r.exceptionDetails.exception?.description || '').slice(0,500)
  : r.result?.value);
process.exit(0);
