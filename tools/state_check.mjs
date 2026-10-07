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

await L('1) WebRTC 真实连接状态', `(function(){
  ${BOOT}
  const w = window.__inputSdk.R.raw.cloudGame.webrtc;
  const pc = w.peerConnection;
  return JSON.stringify({
    peerConnectionState: w.peerConnectionState,
    pcConnState: pc && pc.connectionState,
    pcIceState: pc && pc.iceConnectionState,
    dcReady: w.dataChannel && w.dataChannel.readyState,
    dcBuffered: w.dataChannel && w.dataChannel.bufferedAmount,
    videoPaused: (()=>{ const v=document.querySelector('#gmsdk-video-element'); return v ? {paused:v.paused, readyState:v.readyState, t:v.currentTime} : null; })(),
  }, null, 1);
})()`);

await L('2) 画面是否还在更新（隔 1 秒两次截图比较）', `(async function(){
  ${BOOT}
  const a = window.__narutoAuto;
  const REG = [0,0,1280,720];
  try { a.vision.snapshot(REG); } catch(e){}
  await new Promise(r=>setTimeout(r,1000));
  let d=-1; try { d=a.vision.frameDiff(REG); } catch(e){}
  const v = document.querySelector('#gmsdk-video-element');
  return JSON.stringify({ diffPct: d<0?'n/a':(d*100).toFixed(2)+'%', videoTime: v && v.currentTime, paused: v && v.paused });
})()`);

await L('3) 脚本自己的场景判定（更多细节）', `(function(){
  const a = window.__narutoAuto;
  const out = {};
  try { out.detect = a.scenes.detect(false); } catch(e){ out.err = e.message; }
  return JSON.stringify(out, null, 1).slice(0, 800);
})()`);

await L('4) 用脚本现有坐标点一下屏幕（看游戏是否响应点击）', `(async function(){
  ${BOOT}
  const a = window.__narutoAuto;
  const REG = [0,0,1280,720];
  try { a.vision.snapshot(REG); } catch(e){}
  // 点屏幕中间，看有没有反应
  a.sdk._down(640, 400, 0);
  await new Promise(r=>setTimeout(r,100));
  a.sdk._up(640, 400, 0);
  await new Promise(r=>setTimeout(r,600));
  let d=-1; try { d=a.vision.frameDiff(REG); } catch(e){}
  return JSON.stringify({ clickDiffPct: d<0?'n/a':(d*100).toFixed(2)+'%' });
})()`);
process.exit(0);
