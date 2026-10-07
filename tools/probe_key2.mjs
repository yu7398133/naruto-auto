import { listPages, connect, evaluate } from './cdp.mjs';
const ps = await listPages();
const game = ps.find(p => (p.url || '').includes('arm-game'));
const cdp = await connect(game.webSocketDebuggerUrl);
const ev = async (expr) => {
  const r = await evaluate(cdp, expr, true);
  if (r && r.exceptionDetails) return 'EXC: ' + (r.exceptionDetails.exception?.description || '').slice(0, 400);
  return r && r.result ? r.result.value : JSON.stringify(r);
};
const show = async (l, e) => { console.log('--- ' + l); console.log(await ev(e)); console.log(''); };

// 逐个方法用不同参数形态试调用，看哪个不抛异常
await show('1) 六个键盘方法的签名探测（用 fn.length + toString）', `(function(){
  const o = window.Oprate;
  const out = {};
  for (const m of ['keyDownWindow','keyUpWindow','keyPressWindow','keyDownElement','keyUpElement','keyPressElement']) {
    try {
      const f = o[m];
      out[m] = { length: f.length, src: f.toString().replace(/\\s+/g,' ').slice(0, 160) };
    } catch (e) { out[m] = 'err: ' + e.message; }
  }
  return JSON.stringify(out, null, 1);
})()`);

await show('2) 实调 keyDownWindow（多形态，看哪个返回/不抛）', `(function(){
  const o = window.Oprate;
  const results = [];
  const forms = [
    ['f1 keyCode', () => o.keyDownWindow('KeyW', 87)],
    ['f2 obj',     () => o.keyDownWindow({ key:'w', keyCode:87, code:'KeyW' })],
    ['f3 code',    () => o.keyDownWindow(87)],
    ['f4 key only',() => o.keyDownWindow('w')],
    ['f5 key,code',() => o.keyDownWindow('w','KeyW')],
  ];
  for (const [name, fn] of forms) {
    try { const r = fn(); results.push(name + ' => OK ' + JSON.stringify(r)); }
    catch (e) { results.push(name + ' => THROW ' + (e.message||'').slice(0,90)); }
  }
  return JSON.stringify(results, null, 1);
})()`);

await show('3) keyDownWindow / keyPressWindow 的原型链上游', `(function(){
  const o = window.Oprate;
  const f = o.keyDownWindow;
  // 尝试从闭包里找线索
  return JSON.stringify({
    isFn: typeof f === 'function',
    name: f.name,
    str: f.toString().replace(/\\s+/g,' ')
  });
})()`);

await show('4) 找 SDK 实例对象（可能有更底层 API）', `(function(){
  const cands = ['SDK','sdk','GM','gmsdk','GMSDK','App','app','instance','gameInstance','__gmsdk'];
  const out = {};
  for (const c of cands) { if (window[c]) out[c] = typeof window[c] + (typeof window[c]==='object' ? ' ['+Object.keys(window[c]).slice(0,15).join(',')+']' : ''); }
  return JSON.stringify(out, null, 1);
})()`);
process.exit(0);
