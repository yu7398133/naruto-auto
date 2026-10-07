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
    const v = r.exceptionDetails ? 'EXC ' + (r.exceptionDetails.exception?.description || '').slice(0,500) : r.result?.value;
    console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 1));
  } catch (e) { console.log('ERR ' + e.message); }
  console.log('');
};
const BOOT = `if(!window.__probe_req)window.webpackChunk_app_arm_game.push([[Symbol('p')],{},(r)=>{window.__probe_req=r;}]);`;

await L('1) 从 newArchSDK 拿单例', `(function(){
  const hide = ['__gmsdk_debug_info'];
  // 模块 47860 导出的 h 是单例，注册进 c.Up.objects.set("newArchSDK", this)
  // 遍历 window 找 objects 注册表
  const found = {};
  const scan = (obj, path, depth) => {
    if (!obj || depth > 3) return;
    try {
      if (typeof obj.get === 'function' && typeof obj.set === 'function') {
        const v = obj.get('newArchSDK');
        if (v) found[path] = 'HIT';
      }
    } catch(e){}
  };
  // 更直接：找 __gmsdk 或 SDK 实例
  const keys = Object.keys(window).filter(k => /sdk|SDK|game|Game|arch|Arch/i.test(k));
  return JSON.stringify({ candidates: keys, probe63: window.__probe_req ? 'req ok' : 'no req' }, null, 1);
})()`);

await L('2) 重新加载模块 47860 并导出其 h 单例', `(function(){
  ${BOOT}
  const req = window.__probe_req;
  try {
    const mod = req('47860');
    window.__inputSdk = mod;
    return 'module keys: ' + JSON.stringify(Object.keys(mod));
  } catch(e) { return 'req err: ' + e.message; }
})()`);

await L('3) 探测 __inputSdk.R', `(function(){
  const m = window.__inputSdk;
  if (!m) return 'no module';
  const R = m.R;
  if (!R) return 'no R, keys=' + JSON.stringify(Object.keys(m));
  return JSON.stringify({
    type: typeof R,
    isInstance: !!(R && R.controller),
    hasReady: R ? ('ready' in R) : false,
    readyVal: R ? R.ready : null,
    keys: R ? Object.keys(R) : null,
    proto: R ? Object.getOwnPropertyNames(Object.getPrototypeOf(R) || {}) : null
  }, null, 1);
})()`);

await L('4) 键名映射表 l._ （KEYBOARD_*）', `(function(){
  ${BOOT}
  const req = window.__probe_req;
  // 模块 22744 是 l（映射表）
  try {
    const mod = req('22744');
    const tbl = mod._ || mod.default || mod;
    const keys = Object.keys(tbl).filter(k => k.startsWith('KEYBOARD_'));
    const out = {};
    for (const k of keys.slice(0, 60)) out[k] = tbl[k];
    return JSON.stringify({ total: keys.length, sample: out }, null, 1);
  } catch(e) { return 'err: ' + e.message; }
})()`);
process.exit(0);
