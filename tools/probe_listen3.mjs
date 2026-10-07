import { listPages, connect } from './cdp.mjs';
const ps = await listPages();
const game = ps.find(p => (p.url || '').includes('arm-game'));
const conn = await connect(game.webSocketDebuggerUrl);
const L = async (label, expr) => {
  console.log('--- ' + label);
  try {
    const r = await conn.send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true,
      includeCommandLineAPI: true, userGesture: true,
    });
    const v = r.exceptionDetails ? 'EXC ' + (r.exceptionDetails.exception?.description || '').slice(0,250) : r.result?.value;
    console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 1));
  } catch (e) { console.log('ERR ' + e.message); }
  console.log('');
};

await L('1) input 上 keydown 监听器源码', `(function(){
  const inp = document.querySelector('.g-pc-input');
  const l = getEventListeners(inp);
  const out = {};
  for (const k of Object.keys(l)) {
    out[k] = l[k].map(h => ({ cap: h.useCapture, src: String(h.listener).replace(/\\s+/g,' ').slice(0, 400) }));
  }
  return JSON.stringify(out, null, 1);
})()`);

await L('2) window/document 上 keydown 监听器源码', `(function(){
  const out = {};
  for (const [n, el] of [['window', window], ['document', document]]) {
    const l = getEventListeners(el);
    if (!l.keydown) { out[n] = '(无)'; continue; }
    out[n] = l.keydown.map(h => ({ cap: h.useCapture, src: String(h.listener).replace(/\\s+/g,' ').slice(0, 300) }));
  }
  return JSON.stringify(out, null, 1);
})()`);
process.exit(0);
