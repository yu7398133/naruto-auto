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

await show('1) 找 SDK 要的那个 input 元素', `(function(){
  const sels = ['.webcg-ime-input', '.g-pc-input', 'input', 'textarea'];
  const out = {};
  for (const s of sels) {
    const els = [...document.querySelectorAll(s)];
    out[s] = els.map(e => {
      const r = e.getBoundingClientRect();
      return { cls:(e.className||'').slice(0,40), id:(e.id||'').slice(0,30), type:e.type,
               vis: getComputedStyle(e).display+'/'+getComputedStyle(e).visibility+'/op'+getComputedStyle(e).opacity,
               rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},
               readOnly:e.readOnly, value:(e.value||'').slice(0,20) };
    });
  }
  return JSON.stringify(out, null, 1);
})()`);

await show('2) 整个 DOM 里所有 input 相关元素（含 shadow）', `(function(){
  const walk = (root, depth, acc) => {
    if (depth > 6) return acc;
    for (const el of root.querySelectorAll('*')) {
      if (/input|ime/i.test(el.tagName + ' ' + (el.className||'') + ' ' + (el.id||''))) {
        acc.push({ tag: el.tagName, cls: (el.className||'').toString().slice(0,50), id: (el.id||'').slice(0,30), depth });
      }
      if (el.shadowRoot) walk(el.shadowRoot, depth+1, acc);
    }
    return acc;
  };
  return JSON.stringify(walk(document, 0, []).slice(0, 25), null, 1);
})()`);

await show('3) video 附近的兄弟/父节点结构', `(function(){
  const v = document.querySelector('#gmsdk-video-element');
  if (!v) return 'no video';
  let p = v, chain = [];
  for (let i=0; i<5 && p; i++) {
    chain.push({ tag:p.tagName, id:(p.id||'').slice(0,30), cls:(p.className||'').toString().slice(0,60),
                 kids: p.children.length });
    p = p.parentElement;
  }
  const sibs = v.parentElement ? [...v.parentElement.children].map(c => c.tagName + '.' + (c.className||'').toString().slice(0,30)) : [];
  return JSON.stringify({ chain, siblings: sibs }, null, 1);
})()`);
process.exit(0);
