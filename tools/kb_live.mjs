// 云端键盘实测：sendMockKey 是否真的能驱动游戏
// 用法: node kb_live.mjs <场景名>
//   probe          只查当前场景和 SDK 状态
//   w              按住 W 1 秒（走位测试）
//   j              按 J 3 次（技能测试）
//   wa             W+A 同按 1 秒（斜向测试 —— 关键！）
//   wj             W+J 同按 1 秒（方向+技能并存测试 —— 关键！）
//   all            依次跑 w / j / wa / wj，每步间隔 1.5 秒
import { listPages, connect } from './cdp.mjs';

const ps = await listPages();
const game = ps.find(p => (p.url || '').includes('arm-game'));
if (!game) { console.log('❌ 找不到游戏页面'); process.exit(1); }
const conn = await connect(game.webSocketDebuggerUrl);

const BOOT = [
  "if(!window.__probe_req)window.webpackChunk_app_arm_game.push([[Symbol('p')],{},function(r){window.__probe_req=r;}]);",
  "if(!window.__inputSdk) window.__inputSdk = window.__probe_req('47860');",
  "window.__D = function(kc, down){ return window.__inputSdk.R.pc.keyboard.sendMockKey(kc, down?1:0, true); };",
  "window.__SDKOK = !!(window.__inputSdk && window.__inputSdk.R && window.__inputSdk.R.ready);",
  "window.__K = { w:87, a:65, s:83, d:68, j:74, k:75, i:73, o:79, e:69, r:82, space:32 };",
].join('\n');

const L = async (label, expr) => {
  console.log('--- ' + label);
  try {
    const r = await conn.send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true,
      includeCommandLineAPI: true, userGesture: true,
    });
    const v = r.exceptionDetails ? 'EXC ' + (r.exceptionDetails.exception?.description || '').slice(0,500) : r.result?.value;
    console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 1));
  } catch (e) { console.log('ERR ' + e.message); }
  console.log('');
};

// 辅助：发一组按键 + 量画面差异
const HOLD = (expr) => `(async function(){
  ${BOOT}
  const a = window.__narutoAuto, REGION=[420,160,900,560];
  ${expr}
})()`;

const arg = (process.argv[2] || 'probe').toLowerCase();

if (arg === 'probe' || arg === 'all') {
  await L('场景 & SDK', `(function(){
    ${BOOT}
    let scene='?'; try { scene = window.__narutoAuto.scenes.detect(false).scene; } catch(e){}
    return JSON.stringify({ sdkReady: window.__SDKOK, hasD: typeof window.__D, scene });
  })()`);
}

if (arg === 'w' || arg === 'all') {
  await L('① 按住 W 1.2s（走位）', HOLD(`
    try { a.vision.snapshot(REGION); } catch(e){}
    window.__D(window.__K.w, true);
    await new Promise(r=>setTimeout(r,1200));
    window.__D(window.__K.w, false);
    await new Promise(r=>setTimeout(r,300));
    let d=-1; try { d=a.vision.frameDiff(REGION); } catch(e){}
    return JSON.stringify({ diffPct: d<0?'n/a':(d*100).toFixed(1)+'%' });
  `));
}

if (arg === 'j' || arg === 'all') {
  await L('② 连按 J 3 次（技能）', HOLD(`
    try { a.vision.snapshot(REGION); } catch(e){}
    for (let n=0; n<3; n++) {
      window.__D(window.__K.j, true);
      await new Promise(r=>setTimeout(r,80));
      window.__D(window.__K.j, false);
      await new Promise(r=>setTimeout(r,250));
    }
    await new Promise(r=>setTimeout(r,300));
    let d=-1; try { d=a.vision.frameDiff(REGION); } catch(e){}
    return JSON.stringify({ diffPct: d<0?'n/a':(d*100).toFixed(1)+'%' });
  `));
}

if (arg === 'wa' || arg === 'all') {
  await L('③ W+A 同按 1.2s（斜向 —— 关键）', HOLD(`
    try { a.vision.snapshot(REGION); } catch(e){}
    window.__D(window.__K.w, true);
    window.__D(window.__K.a, true);
    await new Promise(r=>setTimeout(r,1200));
    window.__D(window.__K.a, false);
    window.__D(window.__K.w, false);
    await new Promise(r=>setTimeout(r,300));
    let d=-1; try { d=a.vision.frameDiff(REGION); } catch(e){}
    return JSON.stringify({ diffPct: d<0?'n/a':(d*100).toFixed(1)+'%' });
  `));
}

if (arg === 'wj' || arg === 'all') {
  await L('④ W+J 同按 1.2s（方向+技能并存 —— 关键）', HOLD(`
    try { a.vision.snapshot(REGION); } catch(e){}
    window.__D(window.__K.w, true);
    window.__D(window.__K.j, true);
    await new Promise(r=>setTimeout(r,1200));
    window.__D(window.__K.j, false);
    window.__D(window.__K.w, false);
    await new Promise(r=>setTimeout(r,300));
    let d=-1; try { d=a.vision.frameDiff(REGION); } catch(e){}
    return JSON.stringify({ diffPct: d<0?'n/a':(d*100).toFixed(1)+'%' });
  `));
}

if (arg === 'all') {
  // 单独再补一组「只有 J 单点」作为技能基线对照
  await L('⑤ 对照：单点 J 一次', HOLD(`
    try { a.vision.snapshot(REGION); } catch(e){}
    window.__D(window.__K.j, true);
    await new Promise(r=>setTimeout(r,80));
    window.__D(window.__K.j, false);
    await new Promise(r=>setTimeout(r,800));
    let d=-1; try { d=a.vision.frameDiff(REGION); } catch(e){}
    return JSON.stringify({ diffPct: d<0?'n/a':(d*100).toFixed(1)+'%' });
  `));
}

process.exit(0);
