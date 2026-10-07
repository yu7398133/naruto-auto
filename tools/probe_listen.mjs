import { listPages, connect } from './cdp.mjs';

const ps = await listPages();
const game = ps.find(p => (p.url || '').includes('arm-game'));
const cdp = await connect(game.webSocketDebuggerUrl);

// 直接用 CDP Runtime.evaluate + includeCommandLineAPI，才能用 getEventListeners
const raw = (expression, awaitPromise = false) => new Promise((resolve, reject) => {
  const id = Math.floor(Math.random() * 1e6);
  const onMsg = (m) => {
    let d; try { d = JSON.parse(m.toString ? m.toString() : m); } catch { d = m; }
    if (d.id !== id) return;
    cdp.socket ? null : null;
    resolve(d);
  };
  // connect() 返回的对象结构未知，尽量兼容
  const sock = cdp.socket || cdp.ws || cdp;
  sock.addEventListener('message', onMsg);
  sock.send(JSON.stringify({
    id, method: 'Runtime.evaluate',
    params: { expression, returnByValue: true, awaitPromise, includeCommandLineAPI: true }
  }));
  setTimeout(() => reject(new Error('timeout')), 15000);
});

const q = async (label, expr) => {
  console.log('--- ' + label);
  try {
    const r = await raw(expr);
    const v = r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description ?? JSON.stringify(r).slice(0,300);
    console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 1));
  } catch (e) { console.log('ERR ' + e.message); }
  console.log('');
};

await q('input 上的真实监听器', `(function(){
  const inp = document.querySelector('.g-pc-input');
  const v = document.querySelector('#gmsdk-video-element');
  const out = {};
  for (const [name, el] of [['input', inp], ['video', v], ['window', window], ['document', document]]) {
    if (!el) { out[name] = 'null'; continue; }
    try {
      const l = getEventListeners(el);
      out[name] = Object.keys(l).map(k => k + ':' + l[k].length);
    } catch(e) { out[name] = 'err ' + e.message.slice(0,50); }
  }
  return JSON.stringify(out, null, 1);
})()`);

await q('video 上的监听器（含 key?）', `(function(){
  const v = document.querySelector('#gmsdk-video-element');
  const l = getEventListeners(v);
  const out = {};
  for (const k of Object.keys(l)) out[k] = l[k].length;
  return JSON.stringify(out, null, 1);
})()`);

process.exit(0);
