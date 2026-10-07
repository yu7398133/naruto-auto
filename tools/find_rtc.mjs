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
window.__hookRTC = function(){
  // 在 cloudGame 插件链上找 sendRTC
  const R = window.__inputSdk.R;
  const found = [];
  const seen = new Set();
  const walk = (o, path, d) => {
    if (!o || d > 4 || seen.has(o)) return;
    seen.add(o);
    try {
      if (typeof o.sendRTC === 'function') found.push(path);
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (v && typeof v === 'object') walk(v, path + '.' + k, d + 1);
      }
    } catch(e){}
  };
  walk(R, 'R', 0);
  walk(R.raw, 'R.raw', 0);
  return found;
};
`;

await L('1) 搜索 sendRTC 所在对象', `(function(){
  ${BOOT}
  return JSON.stringify({ paths: window.__hookRTC() }, null, 1);
})()`);

await L('2) R.raw.cloudGame 结构', `(function(){
  ${BOOT}
  const cg = window.__inputSdk.R.raw.cloudGame;
  if (!cg) return 'no cloudGame';
  const out = { keys: Object.keys(cg).slice(0,50) };
  out.proto = Object.getOwnPropertyNames(Object.getPrototypeOf(cg) || {}).slice(0,60);
  for (const k of Object.keys(cg).slice(0,50)) {
    const v = cg[k];
    if (v && typeof v === 'object') out['  ' + k] = Object.keys(v).slice(0,20);
  }
  return JSON.stringify(out, null, 1).slice(0, 2000);
})()`);

await L('3) plugins 里的输入插件', `(function(){
  ${BOOT}
  const R = window.__inputSdk.R;
  const pl = R.raw.plugins;
  const out = {};
  if (pl) {
    out.type = typeof pl;
    out.isArr = Array.isArray(pl);
    if (Array.isArray(pl)) out.items = pl.map(p => (p && (p.name || p.constructor && p.constructor.name)) || typeof p);
    else out.keys = Object.keys(pl).slice(0,40);
  }
  try { out.getPlugin_keyboard = String(R.raw.getPlugin && R.raw.getPlugin('keyboard')).slice(0,120); } catch(e){ out.gpErr = e.message; }
  try { out.getPlugin_input = String(R.raw.getPlugin && R.raw.getPlugin('input')).slice(0,120); } catch(e){}
  return JSON.stringify(out, null, 1);
})()`);
process.exit(0);
