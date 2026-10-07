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
    const v = r.exceptionDetails ? 'EXC ' + (r.exceptionDetails.exception?.description || '').slice(0,500) : r.result?.value;
    console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 1));
  } catch (e) { console.log('ERR ' + e.message); }
  console.log('');
};
const BOOT = `
if(!window.__probe_req)window.webpackChunk_app_arm_game.push([[Symbol('p')],{},(r)=>{window.__probe_req=r;}]);
if(!window.__inputSdk) window.__inputSdk = window.__probe_req('47860');
`;

await L('1) pc.keyboard 接口', `(function(){
  ${BOOT}
  const R = window.__inputSdk.R;
  const pc = R.pc;
  if (!pc) return 'no pc';
  const kb = pc.keyboard;
  return JSON.stringify({
    pcKeys: Object.keys(pc),
    hasKeyboard: !!kb,
    kbKeys: kb ? Object.keys(kb) : null,
    kbProto: kb ? Object.getOwnPropertyNames(Object.getPrototypeOf(kb)) : null
  }, null, 1);
})()`);

await L('2) pc.mouse / pc.ime 接口', `(function(){
  ${BOOT}
  const R = window.__inputSdk.R;
  const pc = R.pc || {};
  const out = {};
  for (const k of ['mouse','ime','touch','touchManager']) {
    const o = pc[k];
    out[k] = o ? { keys: Object.keys(o), proto: Object.getOwnPropertyNames(Object.getPrototypeOf(o)) } : null;
  }
  return JSON.stringify(out, null, 1);
})()`);

await L('3) getClient() 设备尺寸', `(function(){
  ${BOOT}
  const R = window.__inputSdk.R;
  try { const c = R.getClient(); return JSON.stringify({ client: c, dw: c && c.deviceWidth, dh: c && c.deviceHeight }, null, 1); }
  catch(e) { return 'err: ' + e.message; }
})()`);

await L('4) sendKeyEvent 源码', `(function(){
  ${BOOT}
  const R = window.__inputSdk.R;
  const kb = R.pc && R.pc.keyboard;
  if (!kb || !kb.sendKeyEvent) return 'no sendKeyEvent';
  return String(kb.sendKeyEvent).replace(/\\s+/g,' ').slice(0, 800);
})()`);

await L('5) camera / 游戏画面尺寸映射（用于算坐标）', `(function(){
  ${BOOT}
  const R = window.__inputSdk.R;
  try { return JSON.stringify(R.getClient(), null, 1).slice(0, 900); }
  catch(e){ return 'err ' + e.message; }
})()`);
process.exit(0);
