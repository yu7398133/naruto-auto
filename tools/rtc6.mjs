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

await L('1) 当前状态全览', `(function(){
  ${BOOT}
  const a = window.__narutoAuto;
  const w = window.__inputSdk.R.raw.cloudGame.webrtc;
  let scene='?'; try { scene = a.scenes.detect(false).scene; } catch(e){}
  return JSON.stringify({
    scene,
    dcState: w.dataChannel && w.dataChannel.readyState,
    pcState: w.peerConnectionState,
    sdkReady: window.__inputSdk.R.ready,
  }, null, 1);
})()`);

await L('2) 战斗是否结束（探左下角返回按钮）', `(function(){
  const a = window.__narutoAuto;
  try {
    const r = a.vision.findTemplate ? null : null;
  } catch(e){}
  // 用脚本自己的结算探针
  try {
    const det = a.secretRealm || a.tasks || null;
    return 'available probes: ' + Object.keys(a).join(',');
  } catch(e){ return 'err ' + e.message; }
})()`);

// 关键：直接对比「按 W 期间」vs「静止」两个快照序列
await L('3) sendMockKey 按住 W 2 秒（每 250ms 采样画面变化）', `(async function(){
  ${BOOT}
  const a = window.__narutoAuto;
  const REG = [200,80,1100,700];
  const kb = window.__inputSdk.R.pc.keyboard;
  const out = [];
  try { a.vision.snapshot(REG); } catch(e){}
  kb.sendMockKey(87, 1, true);
  for (let i=0;i<8;i++){
    await new Promise(r=>setTimeout(r,250));
    let d=-1; try { d=a.vision.frameDiff(REG); } catch(e){}
    out.push(d<0?'n/a':(d*100).toFixed(2));
  }
  kb.sendMockKey(87, 0, true);
  return JSON.stringify({ wHeld: out }, null, 1);
})()`);

await L('4) 静止 2 秒对照', `(async function(){
  ${BOOT}
  const a = window.__narutoAuto;
  const REG = [200,80,1100,700];
  const out = [];
  try { a.vision.snapshot(REG); } catch(e){}
  for (let i=0;i<8;i++){
    await new Promise(r=>setTimeout(r,250));
    let d=-1; try { d=a.vision.frameDiff(REG); } catch(e){}
    out.push(d<0?'n/a':(d*100).toFixed(2));
  }
  return JSON.stringify({ idle: out }, null, 1);
})()`);
process.exit(0);
