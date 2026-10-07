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

// 给 g-pc-input 挂监听，记录所有到达的事件；并用多种方式派发，看谁真的到达
await show('1) 给 g-pc-input 挂探针 + 三种派发方式对比', `(function(){
  const inp = document.querySelector('.g-pc-input');
  if (!inp) return 'no .g-pc-input';
  inp.focus();
  const got = [];
  const spy = (e) => got.push(e.type + ':' + (e.key||'') + '@' + e.target.className);
  for (const t of ['keydown','keyup','keypress','input','beforeinput','compositionstart'])
    inp.addEventListener(t, spy, true);

  const mk = (type, opts) => new KeyboardEvent(type, Object.assign({
    bubbles:true, cancelable:true, view:window
  }, opts));

  const results = [];
  // 方式 A：直接 inp.dispatchEvent
  try { inp.dispatchEvent(mk('keydown',{key:'w',code:'KeyW',keyCode:87,which:87})); results.push('A inp.dispatchEvent OK'); }
  catch(e){ results.push('A THROW '+e.message); }
  try { inp.dispatchEvent(mk('keyup',{key:'w',code:'KeyW',keyCode:87,which:87})); } catch(e){}

  // 方式 B：document.activeElement 派发
  try { document.activeElement.dispatchEvent(mk('keydown',{key:'a',code:'KeyA',keyCode:65,which:65})); results.push('B activeElement.dispatchEvent OK'); }
  catch(e){ results.push('B THROW '+e.message); }

  // 方式 C：window 派发（老 keyDownWindow 的方式）
  try { window.dispatchEvent(mk('keydown',{key:'d',code:'KeyD',keyCode:68,which:68})); results.push('C window.dispatchEvent OK'); }
  catch(e){ results.push('C THROW '+e.message); }

  for (const t of ['keydown','keyup','keypress','input','beforeinput','compositionstart'])
    inp.removeEventListener(t, spy, true);

  return JSON.stringify({
    focusedEl: document.activeElement.tagName + '.' + document.activeElement.className,
    capturedEvents: got,
    dispatchResults: results
  }, null, 1);
})()`);

await show('2) input 上已有的监听器数量（判断 SDK 是否真的监听了它）', `(function(){
  const inp = document.querySelector('.g-pc-input');
  if (!inp) return 'no input';
  // 用 getEventListeners 在 CDP 的 Runtime.evaluate 里可能可用
  try {
    if (typeof getEventListeners === 'function') {
      const l = getEventListeners(inp);
      const out = {};
      for (const k of Object.keys(l)) out[k] = l[k].length;
      return 'getEventListeners: ' + JSON.stringify(out);
    }
  } catch(e) {}
  return 'getEventListeners 不可用（需 includeCommandLineAPI）';
})()`);
process.exit(0);
