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

// 关键：debugFrameDiff 可能在快照时机上有偏差。
// 改为「连续采样」——按住 W 期间每 200ms 采一次，看画面是否**持续**在变。
await L('1) 按住 W 2 秒，期间连续采样（看是否持续变化）', `(async function(){
  ${BOOT}
  const a = window.__narutoAuto;
  const REG = [200,80,1100,700];
  const kb = window.__inputSdk.R.pc.keyboard;
  const samples = [];
  let prev = null;
  // 用 vision 的原始画面做逐帧比较
  const grab = () => { try { return a.vision.capture(true); } catch(e){ return null; } };
  try { a.vision.snapshot(REG); } catch(e){}
  // sendMockKey 方式（你说有效的那个）
  kb.sendMockKey(87, 1, true);
  for (let i = 0; i < 10; i++) {
    await new Promise(r=>setTimeout(r,200));
    let d = -1; try { d = a.vision.frameDiff(REG); } catch(e){}
    samples.push(d < 0 ? 'n/a' : (d*100).toFixed(2)+'%');
  }
  kb.sendMockKey(87, 0, true);
  await new Promise(r=>setTimeout(r,300));
  return JSON.stringify({ samples, note: '按住W期间每200ms的画面差异' }, null, 1);
})()`);

await L('2) 静止对照：什么都不按，连续采样 2 秒', `(async function(){
  ${BOOT}
  const a = window.__narutoAuto;
  const REG = [200,80,1100,700];
  const samples = [];
  try { a.vision.snapshot(REG); } catch(e){}
  for (let i = 0; i < 10; i++) {
    await new Promise(r=>setTimeout(r,200));
    let d = -1; try { d = a.vision.frameDiff(REG); } catch(e){}
    samples.push(d < 0 ? 'n/a' : (d*100).toFixed(2)+'%');
  }
  return JSON.stringify({ samples, note: '静止基线' }, null, 1);
})()`);
process.exit(0);
