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

// 重新 bootstrap req（跨调用不保留）
const BOOT = `
  if (!window.__probe_req) {
    window.webpackChunk_app_arm_game.push([[Symbol('p')], {}, (req) => { window.__probe_req = req; }]);
  }
`;

await show('1) 在各模块里定位 IA 函数体', `(function(){
  ${BOOT}
  const req = window.__probe_req;
  const out = [];
  for (const id of ['27230','54406','69814','90468']) {
    let src = '';
    try { src = req.m[id].toString(); } catch(e) { continue; }
    // 找 "function IA(" 或 "IA=" 或 "IA(" 定义
    for (const pat of [/function\\s+IA\\s*\\(/g, /\\bIA\\s*=\\s*function/g, /\\bIA\\s*=\\s*\\(/g]) {
      let m; while ((m = pat.exec(src))) {
        out.push({ id, at: m.index, ctx: src.slice(Math.max(0,m.index-80), m.index+400).replace(/\\s+/g,' ') });
      }
    }
  }
  return JSON.stringify(out.slice(0,6), null, 1);
})()`);

await show('2) 直接找 keydown 的发送实现', `(function(){
  ${BOOT}
  const req = window.__probe_req;
  const out = [];
  for (const id of ['27230','54406','69814','90468']) {
    let src = '';
    try { src = req.m[id].toString(); } catch(e) { continue; }
    const i = src.indexOf('keydown');
    if (i >= 0) out.push({ id, ctx: src.slice(Math.max(0,i-300), i+500).replace(/\\s+/g,' ') });
  }
  return JSON.stringify(out.slice(0,4), null, 1);
})()`);
process.exit(0);
