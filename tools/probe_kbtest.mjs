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

// 关键测试：在 window 上派发 keydown/keyup，看是否触发了 SDK 的处理函数。
// 手段：包装 R.emit 或直接看游戏画面变化不可行（需要游戏内），
// 改为：给 window 加一个 capture 探针，同时用「是否被 stopImmediatePropagation」判断。
//
// 更直接：SDK 的 window keydown 监听会在 console 打日志（Ys/il 可能打）。
// 所以我们在页面上装一个 console 拦截器，再派发按键，看有没有新日志。

await L('1) 安装 console 拦截器', `(function(){
  if (window.__kbLog) return '已装';
  window.__kbLog = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  for (const k of ['log','error','warn']) {
    console[k] = function(...a){
      try { window.__kbLog.push(k + ': ' + a.map(x => {
        try { return typeof x === 'string' ? x : JSON.stringify(x); } catch(e){ return String(x); }
      }).join(' ').slice(0,220)); } catch(e){}
      return orig[k].apply(console, a);
    };
  }
  return 'OK';
})()`);

await L('2) 清空日志 + 派发 keydown(w) 到 window', `(function(){
  window.__kbLog = [];
  const v = document.querySelector('#gmsdk-video-element');
  if (document.activeElement !== v) v.focus();
  const ev = new KeyboardEvent('keydown', {
    key:'w', code:'KeyW', keyCode:87, which:87,
    bubbles:true, cancelable:true, view:window
  });
  const notCancelled = window.dispatchEvent(ev);
  return JSON.stringify({ dispatched: true, notCancelled });
})()`);

await L('3) 看日志（派发后）', `JSON.stringify(window.__kbLog.slice(0, 25), null, 1)`);

await L('4) 对比：派发 keyup', `(function(){
  window.__kbLog = [];
  const ev = new KeyboardEvent('keyup', { key:'w', code:'KeyW', keyCode:87, which:87, bubbles:true, cancelable:true, view:window });
  window.dispatchEvent(ev);
  return JSON.stringify(window.__kbLog.slice(0,15), null, 1);
})()`);

// 直接看 SDK 内部状态
await L('5) 探测 SDK 的按键累积状态', `(function(){
  if (!window.__probe_req) window.webpackChunk_app_arm_game.push([[Symbol('p')],{},(r)=>{window.__probe_req=r;}]);
  const req = window.__probe_req;
  const src = req.m['27230'].toString();
  // 找 kd 数组定义
  const i = src.indexOf('kd=[]');
  const j = src.indexOf('var kd');
  return JSON.stringify({
    kdEq: i, varKd: j,
    ctx1: i>=0 ? src.slice(Math.max(0,i-200), i+200).replace(/\\s+/g,' ') : null,
    ctx2: j>=0 ? src.slice(Math.max(0,j-200), j+300).replace(/\\s+/g,' ') : null
  }, null, 1);
})()`);
process.exit(0);
