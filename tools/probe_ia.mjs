import { listPages, connect, evaluate } from './cdp.mjs';
const ps = await listPages();
const game = ps.find(p => (p.url || '').includes('arm-game'));
const cdp = await connect(game.webSocketDebuggerUrl);
const ev = async (expr) => {
  const r = await evaluate(cdp, expr, true);
  if (r && r.exceptionDetails) return 'EXC: ' + (r.exceptionDetails.exception?.description || '').slice(0, 500);
  return r && r.result ? r.result.value : JSON.stringify(r);
};
const show = async (l, e) => { console.log('--- ' + l); console.log(await ev(e)); console.log(''); };

// 在页面所有 script 里搜 IA 函数定义
await show('1) 搜 Oprate 定义源码', `(function(){
  const out = [];
  for (const s of document.querySelectorAll('script')) {
    const t = s.textContent || '';
    if (t.includes('keyDownWindow')) out.push({ len: t.length, url: s.src || '(inline)', hit: t.indexOf('keyDownWindow') });
  }
  return JSON.stringify(out, null, 1);
})()`);

await show('2) 从 webpack chunk 里挖 IA 定义', `(function(){
  // Oprate 的方法体是 function(e){return IA("keydown",e)} —— 去 webpack 模块里找 IA
  const wc = window.webpackChunk_app_arm_game;
  if (!wc) return 'no webpackChunk';
  const mods = [];
  try {
    wc.push([[Symbol('probe')], {}, (req) => {
      // req.m 是所有模块
      const m = req.m || {};
      window.__probe_mods = Object.keys(m);
      window.__probe_req = req;
      mods.push(Object.keys(m).length);
    }]);
  } catch(e) { return 'push err: ' + e.message; }
  return JSON.stringify({ moduleCount: mods, hasReq: !!window.__probe_req });
})()`);

await show('3) 用 req 遍历模块找含 keydown 的', `(function(){
  const req = window.__probe_req;
  if (!req || !req.m) return 'no req.m (' + Object.keys(window).filter(k=>/probe/i.test(k)).join(',') + ')';
  const ids = Object.keys(req.m);
  const hits = [];
  for (const id of ids) {
    try {
      const src = req.m[id].toString();
      if (/keydown/i.test(src) && /keyCode|which|code/i.test(src)) {
        hits.push({ id, len: src.length });
      }
    } catch(e) {}
  }
  return JSON.stringify({ total: ids.length, hits: hits.slice(0, 20) }, null, 1);
})()`);
process.exit(0);
