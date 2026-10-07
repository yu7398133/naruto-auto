import { listPages, connect, evaluate } from './cdp.mjs';

const ps = await listPages();
const game = ps.find(p => (p.url || '').includes('arm-game'));
if (!game) { console.log('❌ 找不到游戏页面'); process.exit(1); }

const cdp = await connect(game.webSocketDebuggerUrl);
const ev = async (expr) => {
  const r = await evaluate(cdp, expr);
  if (r && r.exceptionDetails) return 'EXC: ' + JSON.stringify(r.exceptionDetails).slice(0, 300);
  return r && r.result ? r.result.value : r;
};

console.log('=== 1) 页面结构 ===');
console.log(await ev(`(function(){
  const v = document.querySelector('video');
  const out = { url: location.href.slice(0,80), hasVideo: !!v };
  if (v) {
    const r = v.getBoundingClientRect();
    out.video = { w: v.videoWidth, h: v.videoHeight, cw: Math.round(r.width), ch: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
    out.videoAttrs = { tabIndex: v.tabIndex, id: v.id, cls: (v.className||'').slice(0,60) };
  }
  out.canvases = [...document.querySelectorAll('canvas')].map(c => { const r=c.getBoundingClientRect(); return { w:c.width, h:c.height, cw:Math.round(r.width), ch:Math.round(r.height) }; });
  out.iframes = [...document.querySelectorAll('iframe')].length;
  return JSON.stringify(out, null, 1);
})()`));

console.log('');
console.log('=== 2) 脚本是否注入 ===');
console.log(await ev(`(function(){
  return JSON.stringify({
    hasAuto: typeof window.__narutoAuto !== 'undefined',
    version: (typeof VERSION !== 'undefined') ? VERSION : '(VERSION 未定义)',
    sdkReady: (typeof app !== 'undefined' && app.sdk) ? app.sdk.ready : 'n/a',
    sdkName: (typeof app !== 'undefined' && app.sdk) ? app.sdk.name : 'n/a',
    lastSend: (typeof app !== 'undefined' && app.sdk) ? JSON.stringify(app.sdk.lastSend||null).slice(0,200) : 'n/a'
  });
})()`));

console.log('');
console.log('=== 3) 谁在监听键盘？(挂探针，1秒内手动按键可捕获) ===');
console.log(await ev(`(function(){
  // 列出所有 window / document / video 上的 key 相关监听器（Chrome 内部 API，拿不到时靠后面的探针）
  const targets = { window: window, document: document, video: document.querySelector('video') };
  const out = {};
  for (const [k, t] of Object.entries(targets)) {
    if (!t) { out[k] = 'null'; continue; }
    try {
      const l = (typeof getEventListeners === 'function') ? getEventListeners(t) : null;
      out[k] = l ? Object.keys(l).filter(n => /key|input|compos/i.test(n)).map(n => n + ':' + l[n].length) : '(getEventListeners 不可用)';
    } catch (e) { out[k] = 'err:' + e.message.slice(0,60); }
  }
  return JSON.stringify(out);
})()`));

console.log('');
console.log('=== 4) SDK 暴露的键盘方法 ===');
console.log(await ev(`(function(){
  if (typeof app === 'undefined' || !app.sdk) return '无 app.sdk';
  try { return JSON.stringify(app.sdk.keyChannels ? app.sdk.keyChannels() : '无 keyChannels()', null, 1); }
  catch(e) { return 'err: ' + e.message; }
})()`));
