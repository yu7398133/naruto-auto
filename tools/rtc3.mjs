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

await L('1) 协议判断：isProtoProtocol / dataChannel 状态', `(function(){
  ${BOOT}
  const w = window.__inputSdk.R.raw.cloudGame.webrtc;
  const out = {};
  try { out.isProto = w.context.isProtoProtocol(); } catch(e){ out.isProtoErr = e.message; }
  out.hasDataChannel = !!w.dataChannel;
  out.hasProtoChannel = !!w.protobufDataChannel;
  out.dcState = w.dataChannel && w.dataChannel.readyState;
  out.protoState = w.protobufDataChannel && w.protobufDataChannel.readyState;
  out.isNewStream = w.isNewStream;
  try { out.ctxKeys = Object.keys(w.context).slice(0,30); } catch(e){}
  return JSON.stringify(out, null, 1);
})()`);

await L('2) 抓 dataChannel.send 实际收到的字节', `(function(){
  ${BOOT}
  const w = window.__inputSdk.R.raw.cloudGame.webrtc;
  const dc = w.protobufDataChannel || w.dataChannel;
  if (!dc) return 'no channel';
  if (dc.__hooked) return 'already hooked';
  const orig = dc.send.bind(dc);
  window.__sent = [];
  dc.send = function(d){
    try {
      let desc;
      if (d instanceof ArrayBuffer) desc = { kind:'ArrayBuffer', bytes: Array.from(new Uint8Array(d)).slice(0,24), len: d.byteLength };
      else if (ArrayBuffer.isView(d)) desc = { kind: d.constructor.name, bytes: Array.from(new Uint8Array(d.buffer, d.byteOffset, Math.min(d.byteLength,24))), len: d.byteLength };
      else if (typeof d === 'string') desc = { kind:'string', val: d.slice(0,120) };
      else desc = { kind: typeof d, val: String(d).slice(0,120) };
      window.__sent.push(desc);
    } catch(e) { window.__sent.push({ err: e.message }); }
    return orig(d);
  };
  dc.__hooked = true;
  return 'hooked on ' + (w.protobufDataChannel ? 'protobufDataChannel' : 'dataChannel');
})()`);

await L('3) 发一次 W down，看抓到的字节', `(async function(){
  ${BOOT}
  window.__sent = [];
  const w = window.__inputSdk.R.raw.cloudGame.webrtc;
  const send = (m) => w.send(m);
  try { send({ type:'KeyboardMessage', body:{ action:1, virtualKey:87, repeat:0 } }); } catch(e){}
  await new Promise(r=>setTimeout(r,300));
  return JSON.stringify({ captured: window.__sent }, null, 1);
})()`);

await L('4) 大区域画面差异（W 按住 1.5s）—— 用 try 包住', `(async function(){
  ${BOOT}
  const a = window.__narutoAuto;
  let step = [];
  try {
    const w = window.__inputSdk.R.raw.cloudGame.webrtc;
    const REG = [200,80,1100,700];
    step.push('snapshot');
    try { a.vision.snapshot(REG); } catch(e){ step.push('snapErr:'+e.message); }
    step.push('down');
    w.send({ type:'KeyboardMessage', body:{ action:1, virtualKey:87, repeat:0 } });
    await new Promise(r=>setTimeout(r,1500));
    step.push('up');
    w.send({ type:'KeyboardMessage', body:{ action:2, virtualKey:87, repeat:0 } });
    await new Promise(r=>setTimeout(r,400));
    let d = -1;
    try { d = a.vision.frameDiff(REG); } catch(e){ step.push('diffErr:'+e.message); }
    return JSON.stringify({ step, diffPct: d<0?'n/a':(d*100).toFixed(2)+'%' });
  } catch(e) { return JSON.stringify({ step, fatal: e.message }); }
})()`);
process.exit(0);
