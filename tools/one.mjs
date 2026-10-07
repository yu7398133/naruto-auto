// 逐个单独测试：每种方式单独发一次，中间留足间隔，用户逐个确认
// 用法: node one.mjs <编号>
import { listPages, connect } from './cdp.mjs';
const ps = await listPages();
const game = ps.find(p => (p.url || '').includes('arm-game'));
const conn = await connect(game.webSocketDebuggerUrl);
const BOOT = `
if(!window.__probe_req)window.webpackChunk_app_arm_game.push([[Symbol('p')],{},function(r){window.__probe_req=r;}]);
if(!window.__inputSdk) window.__inputSdk = window.__probe_req('47860');
`;

const METHODS = {
  // 1: sendMockKey（模块 47860 的封装）
  '1': `const kb=window.__inputSdk.R.pc.keyboard; kb.sendMockKey(87,1,true); await sleep(1500); kb.sendMockKey(87,0,true);`,
  // 2: sendKeyEvent 直调，action=1/2
  '2': `const kb=window.__inputSdk.R.pc.keyboard;
        const ev={keyCode:87,key:'w',repeat:false,location:0,getModifierState:()=>false,preventDefault:()=>{}};
        kb.sendKeyEvent(ev,1,true); await sleep(1500); kb.sendKeyEvent(ev,2,true);`,
  // 3: sendKeyEvent 直调，action=60/61（DNF 那套）
  '3': `const kb=window.__inputSdk.R.pc.keyboard;
        const ev={keyCode:87,key:'w',repeat:false,location:0,getModifierState:()=>false,preventDefault:()=>{}};
        kb.sendKeyEvent(ev,60,true); await sleep(1500); kb.sendKeyEvent(ev,61,true);`,
  // 4: 3 字节 DataView
  '4': `const dc=window.__inputSdk.R.raw.cloudGame.webrtc.dataChannel;
        const a=new DataView(new ArrayBuffer(3)); a.setUint8(0,1); a.setUint8(1,87); a.setUint8(2,0); dc.send(a.buffer);
        await sleep(1500);
        const b=new DataView(new ArrayBuffer(3)); b.setUint8(0,2); b.setUint8(1,87); b.setUint8(2,0); dc.send(b.buffer);`,
  // 5: DOM 鼠标点摇杆 W（对照组，已知有效）
  '5': `window.__narutoAuto.sdk._down(219,466,0); await sleep(1500); window.__narutoAuto.sdk._up(219,466,0);`,
  // 6: 原生 KeyboardEvent 到 window
  '6': `const mk=(t)=>new KeyboardEvent(t,{key:'w',code:'KeyW',keyCode:87,which:87,bubbles:true,cancelable:true,view:window});
        window.dispatchEvent(mk('keydown')); await sleep(1500); window.dispatchEvent(mk('keyup'));`,
  // 7: 原生 KeyboardEvent 到 .g-pc-input
  '7': `const inp=document.querySelector('.g-pc-input'); inp.focus();
        const mk=(t)=>new KeyboardEvent(t,{key:'w',code:'KeyW',keyCode:87,which:87,bubbles:true,cancelable:true,view:window});
        inp.dispatchEvent(mk('keydown')); await sleep(1500); inp.dispatchEvent(mk('keyup'));`,
  // 8: Oprate.keyDownWindow / keyUpWindow
  '8': `window.Oprate.keyDownWindow({key:'w',code:'KeyW',keyCode:87,which:87});
        await sleep(1500);
        window.Oprate.keyUpWindow({key:'w',code:'KeyW',keyCode:87,which:87});`,
};

const id = process.argv[2] || '1';
const body = METHODS[id];
if (!body) { console.log('未知编号。可用: ' + Object.keys(METHODS).join(', ')); process.exit(1); }

const expr = `(async function(){
  ${BOOT}
  const sleep = (ms) => new Promise(r=>setTimeout(r,ms));
  const t0 = Date.now();
  try {
    ${body}
    return JSON.stringify({ method: ${id}, ok: true, ms: Date.now()-t0 });
  } catch(e) {
    return JSON.stringify({ method: ${id}, err: e.message, ms: Date.now()-t0 });
  }
})()`;

const r = await conn.send('Runtime.evaluate', {
  expression: expr, returnByValue: true, awaitPromise: true,
  includeCommandLineAPI: true, userGesture: true,
});
console.log(r.exceptionDetails
  ? 'EXC ' + (r.exceptionDetails.exception?.description || '').slice(0,400)
  : r.result?.value);
process.exit(0);
