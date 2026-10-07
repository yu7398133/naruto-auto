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
`;

await L('1) webrtc 对象 & send 源码', `(function(){
  ${BOOT}
  const w = window.__inputSdk.R.raw.cloudGame.webrtc;
  const out = { keys: Object.keys(w).slice(0,40) };
  out.proto = Object.getOwnPropertyNames(Object.getPrototypeOf(w) || {}).slice(0,60);
  for (const m of ['send','sendRTC','sendData','sendMsg','sendMessage']) {
    if (typeof w[m] === 'function') out[m] = String(w[m]).replace(/\\s+/g,' ').slice(0, 500);
  }
  return JSON.stringify(out, null, 1).slice(0, 2200);
})()`);

await L('2) 大区域画面差异重测（W 按住 1.5 秒）', `(async function(){
  ${BOOT}
  const a = window.__narutoAuto;
  const BIG = [0,0,1280,720];
  const rtc = (m) => window.__inputSdk.R.sdk.sendRTC(m);
  const dn = (kc) => rtc({ type:'KeyboardMessage', body:{ action:1, virtualKey:kc, repeat:0 } });
  const up = (kc) => rtc({ type:'KeyboardMessage', body:{ action:2, virtualKey:kc, repeat:0 } });
  try { a.vision.snapshot(BIG); } catch(e){}
  dn(87);
  await new Promise(r=>setTimeout(r,1500));
  up(87);
  await new Promise(r=>setTimeout(r,400));
  let d=-1; try { d=a.vision.frameDiff(BIG); } catch(e){}
  return JSON.stringify({ diffPct: d<0?'n/a':(d*100).toFixed(2)+'%' });
})()`);

await L('3) 对照：DOM 点摇杆 W 1.5 秒（大区域）', `(async function(){
  ${BOOT}
  const a = window.__narutoAuto;
  const BIG = [0,0,1280,720];
  try { a.vision.snapshot(BIG); } catch(e){}
  a.sdk._down(219,466,0);
  await new Promise(r=>setTimeout(r,1500));
  a.sdk._up(219,466,0);
  await new Promise(r=>setTimeout(r,400));
  let d=-1; try { d=a.vision.frameDiff(BIG); } catch(e){}
  return JSON.stringify({ diffPct: d<0?'n/a':(d*100).toFixed(2)+'%' });
})()`);

await L('4) 对照：DOM 点技能键 J 位置（大区域）', `(async function(){
  ${BOOT}
  const a = window.__narutoAuto;
  const BIG = [0,0,1280,720];
  try { a.vision.snapshot(BIG); } catch(e){}
  for (let i=0;i<3;i++){ a.sdk._down(998,633,0); await new Promise(r=>setTimeout(r,80)); a.sdk._up(998,633,0); await new Promise(r=>setTimeout(r,300)); }
  await new Promise(r=>setTimeout(r,400));
  let d=-1; try { d=a.vision.frameDiff(BIG); } catch(e){}
  return JSON.stringify({ diffPct: d<0?'n/a':(d*100).toFixed(2)+'%' });
})()`);
process.exit(0);
