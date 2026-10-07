import { listPages, connect } from './cdp.mjs';
const ps = await listPages();
const game = ps.find(p => (p.url || '').includes('arm-game'));
const conn = await connect(game.webSocketDebuggerUrl);
const L = async (label, expr) => {
  console.log('--- ' + label);
  try {
    const r = await conn.send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true,
      includeCommandLineAPI: true, userGesture: true,
    });
    const v = r.exceptionDetails ? 'EXC ' + (r.exceptionDetails.exception?.description || '').slice(0,700) : r.result?.value;
    console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 1));
  } catch (e) { console.log('ERR ' + e.message); }
  console.log('');
};
const BOOT = `
if(!window.__probe_req)window.webpackChunk_app_arm_game.push([[Symbol('p')],{},function(r){window.__probe_req=r;}]);
if(!window.__inputSdk) window.__inputSdk = window.__probe_req('47860');
`;

// 用 CDP 的 Debugger / Runtime 抓 sendMockKey 内部到底走到哪一步
// 更简单：直接检查 pc 对象上的状态 + 把 sendMockKey 包一层看是否被调用/抛错
await L('1) sendMockKey 实际调用链追踪（包装 + 试调）', `(function(){
  ${BOOT}
  const R = window.__inputSdk.R;
  const kb = R.pc.keyboard;
  const log = [];
  const orig = kb.sendMockKey;
  kb.sendMockKey = function(...args){
    log.push('sendMockKey called with ' + JSON.stringify(args));
    try { const r = orig.apply(this, args); log.push('  → returned ' + r); return r; }
    catch(e){ log.push('  → THREW ' + (e.message||e)); throw e; }
  };
  let outer = null;
  try { outer = kb.sendMockKey(87, 1, true); log.push('outer OK'); }
  catch(e){ log.push('outer THREW ' + (e.message||e)); }
  kb.sendMockKey = orig;
  return JSON.stringify({ log, outer }, null, 1);
})()`);

await L('2) pc.keyboard 内部真正发送的方法（sendKeyEvent）是否被调用', `(function(){
  ${BOOT}
  const kb = window.__inputSdk.R.pc.keyboard;
  const log = [];
  const orig = kb.sendKeyEvent;
  kb.sendKeyEvent = function(...a){
    log.push('sendKeyEvent args=' + JSON.stringify(a).slice(0,300));
    try { const r = orig.apply(this,a); log.push('  → ret ' + r); return r; }
    catch(e){ log.push('  → THREW ' + (e.message||e)); throw e; }
  };
  try { kb.sendMockKey(87, 1, true); } catch(e){ log.push('mock threw ' + e.message); }
  kb.sendKeyEvent = orig;
  return JSON.stringify({ log }, null, 1);
})()`);

await L('3) SDK 的输入发送底层 D.sendRTC 是否存在', `(function(){
  ${BOOT}
  const kb = window.__inputSdk.R.pc.keyboard;
  const own = Object.getOwnPropertyNames(kb);
  return JSON.stringify({ own }, null, 1);
})()`);
process.exit(0);
