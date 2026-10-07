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
    const v = r.exceptionDetails ? 'EXC ' + (r.exceptionDetails.exception?.description || '').slice(0,500) : r.result?.value;
    console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 1));
  } catch (e) { console.log('ERR ' + e.message); }
  console.log('');
};
const BOOT = `
if(!window.__probe_req)window.webpackChunk_app_arm_game.push([[Symbol('p')],{},(r)=>{window.__probe_req=r;}]);
if(!window.__inputSdk) window.__inputSdk = window.__probe_req('47860');
`;

await L('1) sendKeyEvent / sendMockKey 源码', `(function(){
  ${BOOT}
  const kb = window.__inputSdk.R.pc.keyboard;
  return JSON.stringify({
    sendKeyEvent: String(kb.sendKeyEvent).replace(/\\s+/g,' ').slice(0, 1200),
    sendMockKey:  String(kb.sendMockKey).replace(/\\s+/g,' ').slice(0, 900)
  }, null, 1);
})()`);

await L('2) mouse.sendDown / sendUp 源码', `(function(){
  ${BOOT}
  const m = window.__inputSdk.R.pc.mouse;
  return JSON.stringify({
    sendDown: String(m.sendDown).replace(/\\s+/g,' ').slice(0, 900),
    sendUp:   String(m.sendUp).replace(/\\s+/g,' ').slice(0, 700),
    sendMove: String(m.sendMove).replace(/\\s+/g,' ').slice(0, 700)
  }, null, 1);
})()`);

await L('3) getClient() 尺寸', `(function(){
  ${BOOT}
  const R = window.__inputSdk.R;
  const c = R.getClient();
  const out = {};
  for (const k of Object.keys(c||{})) { const v = c[k]; out[k] = (typeof v === 'object') ? typeof v : v; }
  return JSON.stringify(out, null, 1);
})()`);

await L('4) 常用键名（w a s d j k i o e r space）在映射表里的值', `(function(){
  ${BOOT}
  const map = window.__probe_req('22744');
  const t = map._ || map.default || map;
  const want = ['KEY_W','KEY_A','KEY_S','KEY_D','KEY_J','KEY_K','KEY_I','KEY_O','KEY_E','KEY_R','SPACE','KEY_SPACE','RETURN','KEY_RETURN'];
  const out = {};
  for (const w of want) {
    const k = 'KEYBOARD_' + w;
    if (k in t) out[w] = t[k];
  }
  // 再列出所有 KEY_ 开头的字母键
  const letters = {};
  for (const k of Object.keys(t)) {
    if (/^KEYBOARD_KEY_[A-Z]$/.test(k)) letters[k.replace('KEYBOARD_KEY_','')] = t[k];
  }
  return JSON.stringify({ wanted: out, letters }, null, 1);
})()`);
process.exit(0);
