import { listPages, connect, evaluate } from './cdp.mjs';

const pages = await listPages();
const game = pages.find(p => p.type === 'page' && p.title.includes('火影忍者'));
if (!game) { console.log('找不到游戏页面'); process.exit(1); }
console.log('游戏页:', game.title);
console.log('  url:', game.url.slice(0, 100));

const conn = await connect(game.webSocketDebuggerUrl);
await conn.send('Runtime.enable');

const info = await evaluate(conn, `(() => {
  const out = {
    href: location.href,
    title: document.title,
    hasNarutoAuto: typeof window.__narutoAuto !== 'undefined',
  };
  if (window.__narutoAuto) {
    const a = window.__narutoAuto;
    out.apiKeys = Object.keys(a);
    out.version = a.version || a.VERSION || (a.state && a.state.version) || null;
  }
  const vids = [...document.querySelectorAll('video')];
  out.videoCount = vids.length;
  out.videos = vids.map(v => ({ w: v.videoWidth, h: v.videoHeight, paused: v.paused, rs: v.readyState, t: +v.currentTime.toFixed(1) }));
  out.canvasCount = document.querySelectorAll('canvas').length;
  out.scripts = [...document.querySelectorAll('script')].map(s => s.src).filter(Boolean).slice(0, 10);
  return out;
})()`);

console.log(JSON.stringify(info, null, 2));
conn.close();
