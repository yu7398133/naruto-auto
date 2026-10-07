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
    const v = r.exceptionDetails ? 'EXC ' + (r.exceptionDetails.exception?.description || '').slice(0,600) : r.result?.value;
    console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 1));
  } catch (e) { console.log('ERR ' + e.message); }
  console.log('');
};
const BOOT = `
if(!window.__probe_req)window.webpackChunk_app_arm_game.push([[Symbol('p')],{},(r)=>{window.__probe_req=r;}]);
if(!window.__inputSdk) window.__inputSdk = window.__probe_req('47860');
window.__ct = window.__ct || (function(){
  // 找 Ct 常量（KEY_DOWN / KEY_UP）
  return null;
})();
`;

await L('1) 找 Ct.KEY_DOWN / KEY_UP 的值', `(function(){
  ${BOOT}
  const req = window.__probe_req;
  const src = req.m['27230'].toString();
  // Ct 在 27230 里被引用；尝试找 KEY_DOWN: 的定义
  const i = src.indexOf('KEY_DOWN:');
  const j = src.indexOf('KEY_DOWN=');
  return JSON.stringify({
    at1: i, ctx1: i>=0 ? src.slice(i-100, i+200).replace(/\\s+/g,' ') : null,
    at2: j, ctx2: j>=0 ? src.slice(j-100, j+200).replace(/\\s+/g,' ') : null
  }, null, 1);
})()`);

await L('2) 从 SDK 里找 KEY_DOWN 常量对象', `(function(){
  ${BOOT}
  const req = window.__probe_req;
  // 遍历所有模块找含 KEY_DOWN 且形如 {KEY_DOWN:..,KEY_UP:..} 的小对象
  const out = [];
  for (const id of Object.keys(req.m)) {
    let src; try { src = req.m[id].toString(); } catch(e){ continue; }
    if (!src.includes('KEY_DOWN')) continue;
    // 找 KEY_DOWN:数字 的形态
    const m = src.match(/KEY_DOWN\\s*:\\s*\\d+/g);
    const m2 = src.match(/KEY_UP\\s*:\\s*\\d+/g);
    if (m) out.push({ id, down: m.slice(0,3), up: m2 ? m2.slice(0,3) : null, len: src.length });
  }
  return JSON.stringify(out.slice(0,8), null, 1);
})()`);

await L('3) 直接试 sendMockKey —— 先取 KEY_DOWN 值', `(function(){
  ${BOOT}
  const kb = window.__inputSdk.R.pc.keyboard;
  const out = { hasSendMockKey: typeof kb.sendMockKey, hasSendKeyEvent: typeof kb.sendKeyEvent };
  // sendMockKey(e, t=KEY_DOWN, r=false) —— t 是 Ct.KEY_DOWN。常见值: 0=down,1=up 或 1=down,0=up
  // 先试 t=1 与 t=0，看哪个不抛异常
  for (const t of [0,1]) {
    try { kb.sendMockKey(87, t, true); out['t='+t] = 'OK'; }
    catch(e) { out['t='+t] = 'THROW ' + (e.message||'').slice(0,80); }
  }
  return JSON.stringify(out, null, 1);
})()`);

await L('4) 页面 console 有无 SDK 输出（DEBUG DNF 等）', `(function(){
  return 'sentinel';
})()`);
process.exit(0);
