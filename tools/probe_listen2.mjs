import { listPages, connect } from './cdp.mjs';

const ps = await listPages();
const game = ps.find(p => (p.url || '').includes('arm-game'));
const conn = await connect(game.webSocketDebuggerUrl);

// 直接用底层 send，加 includeCommandLineAPI 才能用 getEventListeners
const L = async (label, expr) => {
  console.log('--- ' + label);
  try {
    const r = await conn.send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true,
      includeCommandLineAPI: true, userGesture: true,
    });
    const v = r.exceptionDetails
      ? 'EXC ' + (r.exceptionDetails.exception?.description || '').slice(0, 200)
      : r.result?.value;
    console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 1));
  } catch (e) { console.log('ERR ' + e.message); }
  console.log('');
};

await L('1) 关键元素上的真实监听器', `(function(){
  const out = {};
  const targets = {
    input:  document.querySelector('.g-pc-input'),
    video:  document.querySelector('#gmsdk-video-element'),
    window: window,
    document: document,
    body: document.body,
  };
  for (const [name, el] of Object.entries(targets)) {
    if (!el) { out[name] = 'null'; continue; }
    const l = getEventListeners(el);
    const keys = Object.keys(l);
    out[name] = keys.length ? keys.map(k => k + ':' + l[k].length) : '(无监听)';
  }
  return JSON.stringify(out, null, 1);
})()`);

await L('2) input 上的键盘监听详情', `(function(){
  const inp = document.querySelector('.g-pc-input');
  if (!inp) return 'no input';
  const l = getEventListeners(inp);
  const out = {};
  for (const k of Object.keys(l)) {
    out[k] = l[k].map(h => ({
      useCapture: h.useCapture,
      passive: h.passive,
      once: h.once,
      src: String(h.listener).replace(/\\s+/g,' ').slice(0, 180)
    }));
  }
  return JSON.stringify(out, null, 1);
})()`);

await L('3) video 上是否有键盘监听', `(function(){
  const v = document.querySelector('#gmsdk-video-element');
  const l = getEventListeners(v);
  const out = {};
  for (const k of Object.keys(l)) {
    out[k] = l[k].length + ' 个' + (/(key)/i.test(k) ? '  ← 键盘!' : '');
  }
  return JSON.stringify(out, null, 1);
})()`);

process.exit(0);
