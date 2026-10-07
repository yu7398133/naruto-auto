import { listPages, connect, evaluate } from './cdp.mjs';
const ps = await listPages();
const game = ps.find(p => (p.url || '').includes('arm-game'));
const cdp = await connect(game.webSocketDebuggerUrl);
const ev = async (expr) => {
  const r = await evaluate(cdp, expr);
  if (r && r.exceptionDetails) return 'EXC: ' + (r.exceptionDetails.exception?.description || '').slice(0, 200);
  return r && r.result ? r.result.value : r;
};
const show = async (label, expr) => { console.log('--- ' + label); console.log(await ev(expr)); console.log(''); };

await show('1) 全局里疑似脚本的键', `(function(){
  const keys = Object.keys(window).filter(k => /naruto|auto|app|SDK|sdk|Oprate|gmsdk|GM|vision|Vision/i.test(k));
  const out = {};
  for (const k of keys.slice(0, 40)) out[k] = typeof window[k];
  return JSON.stringify(out, null, 1);
})()`);

await show('2) window.__narutoAuto 是什么', `(function(){
  const a = window.__narutoAuto;
  if (!a) return 'undefined';
  return JSON.stringify({ type: typeof a, keys: Object.keys(a).slice(0,40) }, null, 1);
})()`);

await show('3) gmsdk 相关全局', `(function(){
  const keys = Object.keys(window).filter(k => /gm|GM|Gm/.test(k)).slice(0, 30);
  const out = {};
  for (const k of keys) { try { out[k] = typeof window[k] + (window[k] && typeof window[k]==='object' ? ' ['+Object.keys(window[k]).slice(0,12).join(',')+']' : ''); } catch(e){} }
  return JSON.stringify(out, null, 1);
})()`);

await show('4) video 上的属性/扩展', `(function(){
  const v = document.querySelector('#gmsdk-video-element');
  if (!v) return 'no video';
  const own = Object.keys(v).slice(0, 40);
  const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(v)).filter(n=>/key|focus|input|blur/i.test(n));
  return JSON.stringify({ ownKeys: own, protoKeyish: proto, isConnected: v.isConnected, docActive: document.activeElement && document.activeElement.tagName + '#' + document.activeElement.id }, null, 1);
})()`);
process.exit(0);
