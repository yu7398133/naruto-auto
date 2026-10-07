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
const BOOT = "if(!window.__probe_req)window.webpackChunk_app_arm_game.push([[Symbol('p')],{},function(r){window.__probe_req=r;}]);";

await L('1) 找 Wl / Vd / zl / Rc / Hd 的定义（守卫函数）', `(function(){
  ${BOOT}
  const req = window.__probe_req;
  const out = {};
  for (const name of ['Wl','Vd','zl','Rc','Hd','zt','Jt','ks','Tl','Ys','el','tl','Nc','Ic','Sc','Fc','Id','Ed','Cd','w','A','C']) {
    const hits = [];
    for (const id of Object.keys(req.m)) {
      let src; try { src = req.m[id].toString(); } catch(e){ continue; }
      for (const pat of ['function '+name+'(', 'function '+name+' (', name+'=function', 'function '+name+')']) {
        const i = src.indexOf(pat);
        if (i >= 0) { hits.push({ id, at: i, ctx: src.slice(Math.max(0,i-40), i+260).replace(/\\s+/g,' ') }); break; }
      }
      if (hits.length >= 2) break;
    }
    out[name] = hits;
  }
  // 只返回有定义的
  const filt = {};
  for (const k of Object.keys(out)) if (out[k].length) filt[k] = out[k][0];
  return JSON.stringify(filt, null, 1);
})()`);
process.exit(0);
