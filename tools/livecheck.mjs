import { listPages, connect, evaluate } from './cdp.mjs';

const pages = await listPages();
const g = pages.find(p => p.type === 'page' && /arm-game|start\.qq\.com/.test(p.url || ''));
if (!g) { console.log('ERR: 找不到游戏页'); process.exit(1); }
console.log('游戏页:', g.title);

const conn = await connect(g.webSocketDebuggerUrl);

const r = await evaluate(conn, `(() => {
  const out = {};
  out.videoCount = document.querySelectorAll('video').length;
  const vids = [...document.querySelectorAll('video')];
  out.videos = vids.map(v => ({ w: v.videoWidth, h: v.videoHeight, rs: v.readyState, paused: v.paused }));
  out.canvasCount = document.querySelectorAll('canvas').length;
  const cv = [...document.querySelectorAll('canvas')].map(c => c.width + 'x' + c.height);
  out.canvases = cv;
  out.iframes = document.querySelectorAll('iframe').length;
  out.hasNarutoAuto = typeof window.__narutoAuto !== 'undefined';
  if (out.hasNarutoAuto) {
    out.version = window.__narutoAuto.config && window.__narutoAuto.config.get
      ? (() => { try { return String(window.__narutoAuto.app && window.__narutoAuto.app.VERSION); } catch (e) { return null; } })()
      : null;
    out.apis = Object.keys(window.__narutoAuto);
  }
  return out;
})()`, { awaitPromise: true });
console.log(JSON.stringify(r, null, 2));
conn.close();
