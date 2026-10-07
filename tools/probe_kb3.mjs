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

await show('1) kA 构造器实现（IA 内部用的）', `(function(){
  if (!window.__probe_req) window.webpackChunk_app_arm_game.push([[Symbol('p')],{},(r)=>{window.__probe_req=r;}]);
  const req = window.__probe_req;
  const src = req.m['27230'].toString();
  const out = [];
  for (const pat of [/function\\s+kA\\s*\\(/g, /\\bkA\\s*=\\s*function/g]) {
    let m; while ((m = pat.exec(src))) {
      out.push({ at: m.index, ctx: src.slice(m.index, m.index + 700).replace(/\\s+/g,' ') });
    }
  }
  return JSON.stringify(out.slice(0,3), null, 1);
})()`);

await show('2) 找真正的输入通道（datachannel / sendInput / rtc）', `(function(){
  if (!window.__probe_req) window.webpackChunk_app_arm_game.push([[Symbol('p')],{},(r)=>{window.__probe_req=r;}]);
  const req = window.__probe_req;
  const src = req.m['27230'].toString();
  const pats = ['sendInput','sendKey','datachannel','createDataChannel','sendKeyboard','postMessage','0x50','0x51','keyboard'];
  const out = {};
  for (const p of pats) out[p] = src.indexOf(p);
  return JSON.stringify(out, null, 1);
})()`);

await show('3) 真实验证：在 video 上派发 KeyboardEvent', `(function(){
  const v = document.querySelector('#gmsdk-video-element');
  if (!v) return 'no video';
  if (document.activeElement !== v) v.focus();
  const mk = (type, key, code, keyCode) => new KeyboardEvent(type, {
    key, code, keyCode, which: keyCode, bubbles: true, cancelable: true
  });
  const log = [];
  // 先挂监听看事件是否到达 video
  const spy = (e) => log.push('captured ' + e.type + ' key=' + e.key);
  v.addEventListener('keydown', spy, true);
  v.addEventListener('keyup', spy, true);
  try {
    v.dispatchEvent(mk('keydown','w','KeyW',87));
    v.dispatchEvent(mk('keyup','w','KeyW',87));
  } catch(e) { log.push('THROW ' + e.message); }
  v.removeEventListener('keydown', spy, true);
  v.removeEventListener('keyup', spy, true);
  return JSON.stringify({ focused: document.activeElement === v, log, videoSrc: (v.src||'').slice(0,40) }, null, 1);
})()`);

await show('4) 关键：游戏有没有在 video 上监听 key？（看 SDK 加的监听）', `(function(){
  if (!window.__probe_req) window.webpackChunk_app_arm_game.push([[Symbol('p')],{},(r)=>{window.__probe_req=r;}]);
  const req = window.__probe_req;
  const src = req.m['27230'].toString();
  const i = src.indexOf('"pointerdown","pointerup","mousedown"');
  return JSON.stringify({
    found: i,
    ctx: i>=0 ? src.slice(Math.max(0,i-900), i+800).replace(/\\s+/g,' ') : 'not found'
  }, null, 1);
})()`);
process.exit(0);
