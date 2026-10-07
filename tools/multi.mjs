// 用 action=60(down)/61(up) 验证多键同按
// 用法: node multi.mjs <场景>
//   wa   W+A 同按（斜向）
//   wj   W+J 同按（方向+技能并存）
//   wsad W+A+S+D 四方向
//   wd   W+D
import { listPages, connect } from './cdp.mjs';
const ps = await listPages();
const game = ps.find(p => (p.url || '').includes('arm-game'));
const conn = await connect(game.webSocketDebuggerUrl);
const BOOT = `
if(!window.__probe_req)window.webpackChunk_app_arm_game.push([[Symbol('p')],{},function(r){window.__probe_req=r;}]);
if(!window.__inputSdk) window.__inputSdk = window.__probe_req('47860');
window.__K = { w:87, a:65, s:83, d:68, j:74, k:75, i:73, o:79, e:69, r:82, space:32 };
window.__DN = function(kc){
  const kb = window.__inputSdk.R.pc.keyboard;
  const ev = { keyCode:kc, key:String.fromCharCode(kc).toLowerCase(), repeat:false, location:0,
               getModifierState:function(){return false}, preventDefault:function(){} };
  return kb.sendKeyEvent(ev, 60, true);
};
window.__UPK = function(kc){
  const kb = window.__inputSdk.R.pc.keyboard;
  const ev = { keyCode:kc, key:String.fromCharCode(kc).toLowerCase(), repeat:false, location:0,
               getModifierState:function(){return false}, preventDefault:function(){} };
  return kb.sendKeyEvent(ev, 61, true);
};
`;

const SCENES = {
  wa:   { label: 'W+A 同按（斜向）', downs: [87,65], ups: [65,87] },
  wd:   { label: 'W+D 同按（斜向）', downs: [87,68], ups: [68,87] },
  wj:   { label: 'W+J 同按（方向+技能并存）', downs: [87,74], ups: [74,87] },
  wsad: { label: 'W+A+S+D 四方向全按', downs: [87,65,83,68], ups: [68,83,65,87] },
  j:    { label: '只按 J（技能，对照）', downs: [74], ups: [74] },
  w:    { label: '只按 W（方向，对照）', downs: [87], ups: [87] },
};

const id = process.argv[2] || 'wa';
const sc = SCENES[id];
if (!sc) { console.log('未知。可用: ' + Object.keys(SCENES).join(', ')); process.exit(1); }

const expr = `(async function(){
  ${BOOT}
  const sleep = (ms) => new Promise(r=>setTimeout(r,ms));
  try {
    ${sc.downs.map(k => `window.__DN(${k});`).join('\n    ')}
    await sleep(1800);
    ${sc.ups.map(k => `window.__UPK(${k});`).join('\n    ')}
    return JSON.stringify({ scene: ${JSON.stringify(id)}, label: ${JSON.stringify(sc.label)}, ok: true });
  } catch(e) { return JSON.stringify({ scene: ${JSON.stringify(id)}, err: e.message }); }
})()`;

const r = await conn.send('Runtime.evaluate', {
  expression: expr, returnByValue: true, awaitPromise: true,
  includeCommandLineAPI: true, userGesture: true,
});
console.log(r.exceptionDetails
  ? 'EXC ' + (r.exceptionDetails.exception?.description || '').slice(0,400)
  : r.result?.value);
process.exit(0);
