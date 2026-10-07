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
// 3 字节协议： [action(1=down,2=up)] [keyCode] [repeat]
window.__DN = function(kc){
  const b = new DataView(new ArrayBuffer(3));
  b.setUint8(0, 1); b.setUint8(1, kc); b.setUint8(2, 0);
  window.__inputSdk.R.raw.cloudGame.webrtc.dataChannel.send(b.buffer);
};
window.__UPK = function(kc){
  const b = new DataView(new ArrayBuffer(3));
  b.setUint8(0, 2); b.setUint8(1, kc); b.setUint8(2, 0);
  window.__inputSdk.R.raw.cloudGame.webrtc.dataChannel.send(b.buffer);
};
`;

await L('1) 抓字节确认格式', `(async function(){
  ${BOOT}
  const dc = window.__inputSdk.R.raw.cloudGame.webrtc.dataChannel;
  const orig = dc.send.bind(dc);
  const seen = [];
  dc.send = function(d){
    try {
      if (d instanceof ArrayBuffer) seen.push({ ArrayBuffer: Array.from(new Uint8Array(d)) });
      else if (ArrayBuffer.isView(d)) seen.push({ view: Array.from(new Uint8Array(d.buffer, d.byteOffset, d.byteLength)) });
      else seen.push({ other: Object.prototype.toString.call(d) });
    } catch(e){ seen.push({err:e.message}); }
    return orig(d);
  };
  window.__DN(87);
  window.__UPK(87);
  dc.send = orig;
  return JSON.stringify({ seen }, null, 1);
})()`);

await L('2) 发 W 按住 1.5 秒（3 字节协议）', `(async function(){
  ${BOOT}
  const a = window.__narutoAuto;
  const REG = [200,80,1100,700];
  try { a.vision.snapshot(REG); } catch(e){}
  window.__DN(87);
  await new Promise(r=>setTimeout(r,1500));
  window.__UPK(87);
  await new Promise(r=>setTimeout(r,400));
  let d=-1; try { d=a.vision.frameDiff(REG); } catch(e){}
  return JSON.stringify({ diffPct: d<0?'n/a':(d*100).toFixed(2)+'%' });
})()`);

await L('3) W+A 同按 1.5 秒（斜向，3 字节协议）', `(async function(){
  ${BOOT}
  const a = window.__narutoAuto;
  const REG = [200,80,1100,700];
  try { a.vision.snapshot(REG); } catch(e){}
  window.__DN(87); window.__DN(65);
  await new Promise(r=>setTimeout(r,1500));
  window.__UPK(65); window.__UPK(87);
  await new Promise(r=>setTimeout(r,400));
  let d=-1; try { d=a.vision.frameDiff(REG); } catch(e){}
  return JSON.stringify({ diffPct: d<0?'n/a':(d*100).toFixed(2)+'%' });
})()`);

await L('4) 对照：DOM 点摇杆 W 1.5 秒', `(async function(){
  ${BOOT}
  const a = window.__narutoAuto;
  const REG = [200,80,1100,700];
  try { a.vision.snapshot(REG); } catch(e){}
  a.sdk._down(219,466,0);
  await new Promise(r=>setTimeout(r,1500));
  a.sdk._up(219,466,0);
  await new Promise(r=>setTimeout(r,400));
  let d=-1; try { d=a.vision.frameDiff(REG); } catch(e){}
  return JSON.stringify({ diffPct: d<0?'n/a':(d*100).toFixed(2)+'%' });
})()`);
process.exit(0);
