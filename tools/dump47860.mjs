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
    const v = r.exceptionDetails ? 'EXC ' + (r.exceptionDetails.exception?.description || '').slice(0,400) : r.result?.value;
    console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 1));
  } catch (e) { console.log('ERR ' + e.message); }
  console.log('');
};
const BOOT = `if(!window.__probe_req)window.webpackChunk_app_arm_game.push([[Symbol('p')],{},(r)=>{window.__probe_req=r;}]);`;

await L('1) 模块 47860 全文（前 4000 字）', `(function(){
  ${BOOT}
  const src = window.__probe_req.m['47860'].toString();
  return src.slice(0, 4000);
})()`);
process.exit(0);
