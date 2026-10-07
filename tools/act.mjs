// 单个动作，发完即停。用法: node act.mjs <方案编号>
import { listPages, connect } from './cdp.mjs';
const ps = await listPages();
const game = ps.find(p => (p.url || '').includes('arm-game'));
const conn = await connect(game.webSocketDebuggerUrl);
const BOOT = `
if(!window.__probe_req)window.webpackChunk_app_arm_game.push([[Symbol('p')],{},function(r){window.__probe_req=r;}]);
if(!window.__inputSdk) window.__inputSdk = window.__probe_req('47860');
window.__K = { w:87, a:65, s:83, d:68, j:74, k:75, i:73, o:79, e:69, r:82, space:32 };
`;

// 每个方案: { name, body }  —— body 里可用 sleep / a(脚本全局) / window.__K / window.__inputSdk
const ACTS = {
  // 1 sendKeyEvent 60/61
  'k60': { name: 'sendKeyEvent 60/61 单按W 2.5s', body: `
    const kb = window.__inputSdk.R.pc.keyboard;
    const ev = kc => ({ keyCode:kc, key:String.fromCharCode(kc).toLowerCase(), repeat:false, location:0,
                        getModifierState:()=>false, preventDefault:()=>{} });
    kb.sendKeyEvent(ev(87), 60, true); await sleep(2500); kb.sendKeyEvent(ev(87), 61, true);` },

  // 1b sendKeyEvent 60/61 + 完整 modifier 字段
  'k60m': { name: 'sendKeyEvent 60/61 + modifier字段 单按W 2.5s', body: `
    const kb = window.__inputSdk.R.pc.keyboard;
    const ev = kc => ({ keyCode:kc, key:String.fromCharCode(kc).toLowerCase(), code:'Key'+String.fromCharCode(kc),
                        repeat:false, location:0,
                        ctrlKey:false, metaKey:false, altKey:false, shiftKey:false,
                        getModifierState:()=>false, preventDefault:()=>{} });
    kb.sendKeyEvent(ev(87), 60, true); await sleep(2500); kb.sendKeyEvent(ev(87), 61, true);` },

  // 2 DOM 鼠标点摇杆
  'mouse': { name: 'DOM鼠标点摇杆W(219,466) 2.5s', body: `
    a.sdk._down(219,466,0); await sleep(2500); a.sdk._up(219,466,0);` },

  // 3 sendMockKey
  'mock': { name: 'sendMockKey 单按W 2.5s', body: `
    const kb = window.__inputSdk.R.pc.keyboard;
    kb.sendMockKey(87,1,true); await sleep(2500); kb.sendMockKey(87,0,true);` },

  // 4 sendKeyEvent 1/2
  'k12': { name: 'sendKeyEvent 1/2 单按W 2.5s', body: `
    const kb = window.__inputSdk.R.pc.keyboard;
    const ev = kc => ({ keyCode:kc, key:String.fromCharCode(kc).toLowerCase(), repeat:false, location:0,
                        getModifierState:()=>false, preventDefault:()=>{} });
    kb.sendKeyEvent(ev(87), 1, true); await sleep(2500); kb.sendKeyEvent(ev(87), 2, true);` },

  // 5 原生 KeyboardEvent → window
  'nw': { name: '原生KeyboardEvent→window 单按W 2.5s', body: `
    const mk = t => new KeyboardEvent(t,{key:'w',code:'KeyW',keyCode:87,which:87,bubbles:true,cancelable:true,view:window});
    window.dispatchEvent(mk('keydown')); await sleep(2500); window.dispatchEvent(mk('keyup'));` },

  // 6 原生 KeyboardEvent → .g-pc-input
  'ni': { name: '原生KeyboardEvent→.g-pc-input 单按W 2.5s', body: `
    const inp = document.querySelector('.g-pc-input'); if(inp) inp.focus();
    const mk = t => new KeyboardEvent(t,{key:'w',code:'KeyW',keyCode:87,which:87,bubbles:true,cancelable:true,view:window});
    (inp||document).dispatchEvent(mk('keydown')); await sleep(2500); (inp||document).dispatchEvent(mk('keyup'));` },

  // 7 Oprate.keyDownWindow
  'op': { name: 'Oprate.keyDownWindow 单按W 2.5s', body: `
    window.Oprate.keyDownWindow({key:'w',code:'KeyW',keyCode:87,which:87});
    await sleep(2500);
    window.Oprate.keyUpWindow({key:'w',code:'KeyW',keyCode:87,which:87});` },
  // 8 原生事件 + sendKeyEvent 组合
  'nw+k60': { name: '原生事件→window + sendKeyEvent(60/61) 组合 2.5s', body: `
    const kb = window.__inputSdk.R.pc.keyboard;
    const mk = t => new KeyboardEvent(t,{key:'w',code:'KeyW',keyCode:87,which:87,bubbles:true,cancelable:true,view:window});
    const ev = { keyCode:87, key:'w', code:'KeyW', repeat:false, location:0,
                 ctrlKey:false, metaKey:false, altKey:false, shiftKey:false,
                 getModifierState:()=>false, preventDefault:()=>{} };
    window.dispatchEvent(mk('keydown')); kb.sendKeyEvent(ev, 60, true);
    await sleep(2500);
    window.dispatchEvent(mk('keyup'));   kb.sendKeyEvent(ev, 61, true);` },

  // 10 原生事件 → video 元素
  'nv': { name: '原生KeyboardEvent→video元素 2.5s', body: `
    const v = document.querySelector('#gmsdk-video-element');
    const mk = t => new KeyboardEvent(t,{key:'w',code:'KeyW',keyCode:87,which:87,bubbles:true,cancelable:true,view:window});
    v.dispatchEvent(mk('keydown')); await sleep(2500); v.dispatchEvent(mk('keyup'));` },

  // 11 原生事件 → document
  'nd': { name: '原生KeyboardEvent→document 2.5s', body: `
    const mk = t => new KeyboardEvent(t,{key:'w',code:'KeyW',keyCode:87,which:87,bubbles:true,cancelable:true,view:window});
    document.dispatchEvent(mk('keydown')); await sleep(2500); document.dispatchEvent(mk('keyup'));` },
  // 12 只 sendKeyEvent，纯最小事件对象，连发 3 次
  'k60x3': { name: '只 sendKeyEvent(60/61) 最小对象 ×3次 2.5s', body: `
    const kb = window.__inputSdk.R.pc.keyboard;
    const ev = { keyCode:87, key:'w', repeat:false, location:0,
                 getModifierState:()=>false, preventDefault:()=>{} };
    for (let i=0;i<3;i++){ kb.sendKeyEvent(ev, 60, true); await sleep(60); kb.sendKeyEvent(ev, 61, true); await sleep(60); }
    kb.sendKeyEvent(ev, 60, true); await sleep(2500); kb.sendKeyEvent(ev, 61, true);` },

  // 13 原生事件派发到 window，但用 capture 阶段手动再发（探明是否为 emit 负责）
  'nw-once': { name: '原生keydown→window 一次（不发keyup直到最后）2.5s', body: `
    const mk = t => new KeyboardEvent(t,{key:'w',code:'KeyW',keyCode:87,which:87,bubbles:true,cancelable:true,view:window});
    window.dispatchEvent(mk('keydown'));
    await sleep(2500);
    window.dispatchEvent(mk('keyup'));` },
  // 14 原生事件多键：W+J 同按
  'nw-wj': { name: '原生事件 W+J 同按→window 2.5s', body: `
    const mk = (t,k,c,kc) => new KeyboardEvent(t,{key:k,code:c,keyCode:kc,which:kc,bubbles:true,cancelable:true,view:window});
    window.dispatchEvent(mk('keydown','w','KeyW',87));
    window.dispatchEvent(mk('keydown','j','KeyJ',74));
    await sleep(2500);
    window.dispatchEvent(mk('keyup','j','KeyJ',74));
    window.dispatchEvent(mk('keyup','w','KeyW',87));` },

  // 15 原生事件多键：W+A 斜向
  'nw-wa': { name: '原生事件 W+A 同按→window 2.5s', body: `
    const mk = (t,k,c,kc) => new KeyboardEvent(t,{key:k,code:c,keyCode:kc,which:kc,bubbles:true,cancelable:true,view:window});
    window.dispatchEvent(mk('keydown','w','KeyW',87));
    window.dispatchEvent(mk('keydown','a','KeyA',65));
    await sleep(2500);
    window.dispatchEvent(mk('keyup','a','KeyA',65));
    window.dispatchEvent(mk('keyup','w','KeyW',87));` },
  // 16 原生事件多键：S+D 同按
  'nw-sd': { name: '原生事件 S+D 同按→window 2.5s', body: `
    const mk = (t,k,c,kc) => new KeyboardEvent(t,{key:k,code:c,keyCode:kc,which:kc,bubbles:true,cancelable:true,view:window});
    window.dispatchEvent(mk('keydown','s','KeyS',83));
    window.dispatchEvent(mk('keydown','d','KeyD',68));
    await sleep(2500);
    window.dispatchEvent(mk('keyup','d','KeyD',68));
    window.dispatchEvent(mk('keyup','s','KeyS',83));` },
};

const id = process.argv[2];
const act = ACTS[id];
if (!act) { console.log('可用: ' + Object.keys(ACTS).join(', ')); process.exit(1); }

const expr = `(async function(){
  ${BOOT}
  const sleep = ms => new Promise(r=>setTimeout(r,ms));
  const a = window.__narutoAuto;
  try { ${act.body} return JSON.stringify({ sent: ${JSON.stringify(id)}, name: ${JSON.stringify(act.name)} }); }
  catch(e) { return JSON.stringify({ sent: ${JSON.stringify(id)}, err: e.message }); }
})()`;

const r = await conn.send('Runtime.evaluate', {
  expression: expr, returnByValue: true, awaitPromise: true,
  includeCommandLineAPI: true, userGesture: true,
});
console.log(r.exceptionDetails
  ? 'EXC ' + (r.exceptionDetails.exception?.description || '').slice(0,400)
  : r.result?.value);
process.exit(0);
