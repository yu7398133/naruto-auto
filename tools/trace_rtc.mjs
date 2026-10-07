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
    const v = r.exceptionDetails ? 'EXC ' + (r.exceptionDetails.exception?.description || '').slice(0,700) : r.result?.value;
    console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 1));
  } catch (e) { console.log('ERR ' + e.message); }
  console.log('');
};
const BOOT = `
if(!window.__probe_req)window.webpackChunk_app_arm_game.push([[Symbol('p')],{},function(r){window.__probe_req=r;}]);
if(!window.__inputSdk) window.__inputSdk = window.__probe_req('47860');
`;

await L('1) R.raw 是什么（含 sendRTC？）', `(function(){
  ${BOOT}
  const R = window.__inputSdk.R;
  const raw = R.raw;
  const out = { rawType: typeof raw };
  if (raw) {
    out.rawKeys = Object.keys(raw).slice(0,40);
    out.rawProto = Object.getOwnPropertyNames(Object.getPrototypeOf(raw) || {}).slice(0,40);
  }
  return JSON.stringify(out, null, 1);
})()`);

await L('2) getPeerConnection / 数据通道状态', `(function(){
  ${BOOT}
  const R = window.__inputSdk.R;
  const out = {};
  try { const pc = R.getPeerConnection && R.getPeerConnection();
    out.pc = pc ? { connState: pc.connectionState, ice: pc.iceConnectionState,
                    channels: pc.getSenders ? 'hasSenders' : null } : null;
  } catch(e){ out.pcErr = e.message; }
  try { out.device = R.getDevice && R.getDevice(); } catch(e){ out.devErr = e.message; }
  try { out.client = R.getClient && R.getClient(); } catch(e){ out.cliErr = e.message; }
  return JSON.stringify(out, null, 1).slice(0, 1500);
})()`);

await L('3) 找 D.sendRTC（模块内）', `(function(){
  ${BOOT}
  const req = window.__probe_req;
  const out = [];
  for (const id of Object.keys(req.m)) {
    let src; try { src = req.m[id].toString(); } catch(e){ continue; }
    if (src.includes('sendRTC')) {
      const i = src.indexOf('sendRTC');
      out.push({ id, len: src.length, at: i,
        ctx: src.slice(Math.max(0,i-500), i+700).replace(/\\s+/g,' ') });
    }
  }
  return JSON.stringify(out.slice(0,3), null, 1).slice(0, 2600);
})()`);
process.exit(0);
