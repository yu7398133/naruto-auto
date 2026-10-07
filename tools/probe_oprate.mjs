import { listPages, connect, evaluate } from './cdp.mjs';
const ps = await listPages();
const game = ps.find(p => (p.url || '').includes('arm-game'));
const cdp = await connect(game.webSocketDebuggerUrl);
const ev = async (expr) => {
  const r = await evaluate(cdp, expr, true);   // awaitPromise
  if (r && r.exceptionDetails) return 'EXC: ' + (r.exceptionDetails.exception?.description || '').slice(0, 300);
  return r && r.result ? r.result.value : JSON.stringify(r);
};
const show = async (label, expr) => { console.log('--- ' + label); console.log(await ev(expr)); console.log(''); };

await show('1) Oprate 上所有方法名', `(function(){
  const o = window.Oprate;
  if (!o) return 'no Oprate';
  const names = new Set();
  let p = o;
  while (p && p !== Object.prototype) { Object.getOwnPropertyNames(p).forEach(n=>names.add(n)); p = Object.getPrototypeOf(p); }
  const all = [...names];
  return JSON.stringify({
    total: all.length,
    keyboardish: all.filter(n => /key|Key/i.test(n)),
    inputish: all.filter(n => /mouse|Mouse|touch|Touch|send|Send|input|Input/i.test(n)),
    everything: all.slice(0, 80)
  }, null, 1);
})()`);

await show('2) Oprate 类型与状态', `(function(){
  const o = window.Oprate;
  return JSON.stringify({
    ctor: o && o.constructor && o.constructor.name,
    keys: Object.keys(o).slice(0,30),
    ownNames: Object.getOwnPropertyNames(o).slice(0,60)
  }, null, 1);
})()`);

await show('3) 我的 sdk 适配器认到的 caps', `(function(){
  const a = window.__narutoAuto;
  if (!a || !a.sdk) return 'no sdk';
  return JSON.stringify({ name: a.sdk.name, ready: a.sdk.ready, caps: a.sdk.caps, lastSend: a.sdk.lastSend }, null, 1);
})()`);

await show('4) keyChannels() 结果', `(function(){
  const a = window.__narutoAuto;
  if (!a || !a.sdk) return 'no sdk';
  try { return JSON.stringify(a.sdk.keyChannels(), null, 1); } catch(e) { return 'err: '+e.message; }
})()`);
process.exit(0);
