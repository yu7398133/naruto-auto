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
if(!window.__log) {
  window.__log = [];
  const o = console.log;
  console.log = function(...a){ try{ window.__log.push(a.map(x=>{try{return typeof x==='object'?JSON.stringify(x):String(x)}catch(e){return String(x)}}).join(' ').slice(0,200)); }catch(e){} return o.apply(console,a); };
}
`;

await L('1) 直接调 sendKeyEvent，action=1(down)，抓 [CgsProto] 日志', `(function(){
  ${BOOT}
  window.__log = [];
  const kb = window.__inputSdk.R.pc.keyboard;
  const ev = { keyCode:87, key:'w', repeat:false, location:0,
               getModifierState:function(){return false}, preventDefault:function(){} };
  let err = null;
  try { kb.sendKeyEvent(ev, 1, true); } catch(e){ err = e.message; }
  return JSON.stringify({ err, log: window.__log.slice(0,20) }, null, 1);
})()`);

await L('2) 再试 action=2(up)', `(function(){
  ${BOOT}
  window.__log = [];
  const kb = window.__inputSdk.R.pc.keyboard;
  const ev = { keyCode:87, key:'w', repeat:false, location:0,
               getModifierState:function(){return false}, preventDefault:function(){} };
  let err = null;
  try { kb.sendKeyEvent(ev, 2, true); } catch(e){ err = e.message; }
  return JSON.stringify({ err, log: window.__log.slice(0,20) }, null, 1);
})()`);

await L('3) 对照：调 sendMockKey 看有无日志', `(function(){
  ${BOOT}
  window.__log = [];
  const kb = window.__inputSdk.R.pc.keyboard;
  try { kb.sendMockKey(87, 1, true); } catch(e){}
  return JSON.stringify({ log: window.__log.slice(0,20) }, null, 1);
})()`);

await L('4) 判断 zd() / 架构分支', `(function(){
  ${BOOT}
  // 看 R.raw / getSDKConfig 里的架构标志
  const R = window.__inputSdk.R;
  let cfg = null; try { cfg = R.getSDKConfig && R.getSDKConfig(); } catch(e){}
  return JSON.stringify({ hasRaw: !!R.raw, cfgType: typeof cfg,
    cfgKeys: cfg ? Object.keys(cfg).slice(0,20) : null,
    sdkName: R.sdk && R.sdk.name }, null, 1);
})()`);
process.exit(0);
