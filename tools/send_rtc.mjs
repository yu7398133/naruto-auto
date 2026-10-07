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
    const v = r.exceptionDetails ? 'EXC ' + (r.exceptionDetails.exception?.description || '').slice(0,900) : r.result?.value;
    console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 1));
  } catch (e) { console.log('ERR ' + e.message); }
  console.log('');
};
const BOOT = `
if(!window.__probe_req)window.webpackChunk_app_arm_game.push([[Symbol('p')],{},function(r){window.__probe_req=r;}]);
if(!window.__inputSdk) window.__inputSdk = window.__probe_req('47860');
window.__RTC = function(msg){
  const sdk = window.__inputSdk.R.sdk;
  return sdk.sendRTC(msg);
};
window.__KDOWN = function(kc){ return window.__RTC({ type:'KeyboardMessage', body:{ action:1, virtualKey:Number(kc), repeat:0 } }); };
window.__KUP   = function(kc){ return window.__RTC({ type:'KeyboardMessage', body:{ action:2, virtualKey:Number(kc), repeat:0 } }); };
`;

await L('1) R.sdk.sendRTC 源码', `(function(){
  ${BOOT}
  const s = window.__inputSdk.R.sdk;
  return JSON.stringify({
    keys: Object.keys(s).slice(0,30),
    src: String(s.sendRTC).replace(/\\s+/g,' ').slice(0, 900)
  }, null, 1);
})()`);

await L('2) 直接发 W down → 1秒 → W up（纯 sendRTC）', `(async function(){
  ${BOOT}
  const a = window.__narutoAuto, REGION=[420,160,900,560];
  try { a.vision.snapshot(REGION); } catch(e){}
  let e1=null,e2=null;
  try { window.__KDOWN(87); } catch(e){ e1 = e.message; }
  await new Promise(r=>setTimeout(r,1000));
  try { window.__KUP(87); } catch(e){ e2 = e.message; }
  await new Promise(r=>setTimeout(r,300));
  let d=-1; try { d=a.vision.frameDiff(REGION); } catch(e){}
  return JSON.stringify({ downErr:e1, upErr:e2, diffPct: d<0?'n/a':(d*100).toFixed(1)+'%' });
})()`);

await L('3) W+A 同按 1秒（斜向）', `(async function(){
  ${BOOT}
  const a = window.__narutoAuto, REGION=[420,160,900,560];
  try { a.vision.snapshot(REGION); } catch(e){}
  try { window.__KDOWN(87); window.__KDOWN(65); } catch(e){}
  await new Promise(r=>setTimeout(r,1000));
  try { window.__KUP(65); window.__KUP(87); } catch(e){}
  await new Promise(r=>setTimeout(r,300));
  let d=-1; try { d=a.vision.frameDiff(REGION); } catch(e){}
  return JSON.stringify({ diffPct: d<0?'n/a':(d*100).toFixed(1)+'%' });
})()`);
process.exit(0);
