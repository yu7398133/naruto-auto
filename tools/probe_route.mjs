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
    const v = r.exceptionDetails ? 'EXC ' + (r.exceptionDetails.exception?.description || '').slice(0,400) : r.result?.value;
    console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 1));
  } catch (e) { console.log('ERR ' + e.message); }
  console.log('');
};

const BOOT = `if(!window.__probe_req)window.webpackChunk_app_arm_game.push([[Symbol('p')],{},(r)=>{window.__probe_req=r;}]);`;

await L('1) 定位 window keydown 里的 il/Ys/Ct 所在模块与上下文', `(function(){
  ${BOOT}
  const req = window.__probe_req;
  const out = [];
  for (const id of Object.keys(req.m)) {
    let src; try { src = req.m[id].toString(); } catch(e){ continue; }
    if (src.includes('il(e,Ct.KEY_DOWN)') || src.includes('Ct.KEY_DOWN')) {
      const i = src.indexOf('Ct.KEY_DOWN');
      out.push({ id, len: src.length, at: i,
        ctx: src.slice(Math.max(0,i-600), i+900).replace(/\\s+/g,' ') });
    }
  }
  return JSON.stringify(out.slice(0,3), null, 1);
})()`);

await L('2) 找 KEY_DOWN 的消费方（谁把按键送云端）', `(function(){
  ${BOOT}
  const req = window.__probe_req;
  const out = [];
  for (const id of Object.keys(req.m)) {
    let src; try { src = req.m[id].toString(); } catch(e){ continue; }
    // 找 WebRTC / RTCDataChannel / send 相关
    if (/(RTCDataChannel|createDataChannel|dataChannel)/.test(src) && /key|Key|input|Input/.test(src)) {
      out.push({ id, len: src.length,
        rtc: src.search(/RTCDataChannel|createDataChannel/),
        key: src.search(/KEY_DOWN|keyDown/) });
    }
  }
  return JSON.stringify(out.slice(0,10), null, 1);
})()`);

await L('3) 找所有含 sendData / send( 的输入发送点', `(function(){
  ${BOOT}
  const req = window.__probe_req;
  const out = [];
  for (const id of Object.keys(req.m)) {
    let src; try { src = req.m[id].toString(); } catch(e){ continue; }
    if (/sendInputEvent|sendKeyEvent|send_key|sendData\\(|channel\\.send/.test(src)) {
      out.push({ id, len: src.length });
    }
  }
  return JSON.stringify(out.slice(0,15), null, 1);
})()`);
process.exit(0);
