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

// sendMockKey 源码: function fl(e){var t=1<arguments.length&&void 0!==arguments[1]?arguments[1]:Ct.KEY_DOWN,
//   r=2<arguments.length&&void 0!==arguments[2]&&arguments[2]; Wl()||(e=Jt(e))&&il({...},t,!0)}
// 注意!! 这里 Wl() 在**整个模块作用域**里。它可能不是"守卫"而是别的。
// 但真正的问题是 Jt(e) —— 之前我们查到 27230 里的 Jt 是 lodash 的 slice！
// 说明 47860 模块自己的 Jt 是别的。用 toString 看真实的闭包引用值拿不到，
// 那就直接**测试哪些路径能走到 sendKeyEvent**。

await L('1) 直接调 sendKeyEvent（绕过 sendMockKey）', `(function(){
  ${BOOT}
  const kb = window.__inputSdk.R.pc.keyboard;
  const log = [];
  const orig = kb.sendKeyEvent;
  kb.sendKeyEvent = function(...a){ log.push('called ' + JSON.stringify(a).slice(0,200)); 
    try { const r = orig.apply(this,a); log.push('ret ' + r); return r; } catch(e){ log.push('THREW ' + e.message); } };
  let ret = null, err = null;
  try { ret = kb.sendKeyEvent({ keyCode:87, key:'w', repeat:false, location:0,
      getModifierState:function(){return false}, preventDefault:function(){} }, 60, true); }
  catch(e){ err = e.message; }
  kb.sendKeyEvent = orig;
  return JSON.stringify({ log, ret, err }, null, 1);
})()`);

await L('2) sendKeyEvent 的 60/61 参数到底该传什么（看源码里的判断）', `(function(){
  ${BOOT}
  const kb = window.__inputSdk.R.pc.keyboard;
  return String(kb.sendKeyEvent).replace(/\\s+/g,' ').slice(0, 2500);
})()`);
process.exit(0);
