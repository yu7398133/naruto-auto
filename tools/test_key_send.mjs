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
    const v = r.exceptionDetails ? 'EXC ' + (r.exceptionDetails.exception?.description || '').slice(0,600) : r.result?.value;
    console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 1));
  } catch (e) { console.log('ERR ' + e.message); }
  console.log('');
};

const BOOT = [
  "if(!window.__probe_req)window.webpackChunk_app_arm_game.push([[Symbol('p')],{},function(r){window.__probe_req=r;}]);",
  "if(!window.__inputSdk) window.__inputSdk = window.__probe_req('47860');",
  "window.__D = function(kc, down){ return window.__inputSdk.R.pc.keyboard.sendMockKey(kc, down?1:0, true); };",
  "window.__SDKOK = !!(window.__inputSdk && window.__inputSdk.R && window.__inputSdk.R.ready);",
].join('\n');

await L('0) 注入', `(function(){ ${BOOT} return JSON.stringify({ ok: window.__SDKOK, hasD: typeof window.__D }); })()`);

await L('1) 场景', `(function(){
  const a = window.__narutoAuto;
  try { return JSON.stringify({ scene: a.scenes.detect(false).scene }); } catch(e){ return 'err '+e.message; }
})()`);

await L('2) 按住 W 1.2s', `(async function(){
  ${BOOT}
  const a = window.__narutoAuto, REGION=[420,160,900,560];
  try { a.vision.snapshot(REGION); } catch(e){}
  window.__D(87, true);
  await new Promise(r=>setTimeout(r,1200));
  window.__D(87, false);
  await new Promise(r=>setTimeout(r,250));
  let d=-1; try { d=a.vision.frameDiff(REGION); } catch(e){}
  return JSON.stringify({ diffPct: d<0?'n/a':(d*100).toFixed(1)+'%' });
})()`);

await L('3) 对照 DOM 点摇杆 W 1.2s', `(async function(){
  ${BOOT}
  const a = window.__narutoAuto, REGION=[420,160,900,560];
  try { a.vision.snapshot(REGION); } catch(e){}
  a.sdk._down(219,466,0);
  await new Promise(r=>setTimeout(r,1200));
  a.sdk._up(219,466,0);
  await new Promise(r=>setTimeout(r,250));
  let d=-1; try { d=a.vision.frameDiff(REGION); } catch(e){}
  return JSON.stringify({ diffPct: d<0?'n/a':(d*100).toFixed(1)+'%' });
})()`);

await L('4) 多键同按 W+J 1.2s', `(async function(){
  ${BOOT}
  const a = window.__narutoAuto, REGION=[420,160,900,560];
  try { a.vision.snapshot(REGION); } catch(e){}
  window.__D(87,true); window.__D(74,true);
  await new Promise(r=>setTimeout(r,1200));
  window.__D(74,false); window.__D(87,false);
  await new Promise(r=>setTimeout(r,250));
  let d=-1; try { d=a.vision.frameDiff(REGION); } catch(e){}
  return JSON.stringify({ diffPct: d<0?'n/a':(d*100).toFixed(1)+'%' });
})()`);
process.exit(0);
