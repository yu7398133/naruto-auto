import { listPages, connect, evaluate } from './cdp.mjs';

const pages = await listPages();
const game = pages.find(p => p.type === 'page' && /start\.qq\.com/.test(p.url || ''));
if (!game) { console.log('NO_GAME_PAGE'); process.exit(1); }
console.log('title:', game.title);
const conn = await connect(game.webSocketDebuggerUrl);
await conn.send('Runtime.enable');

const r = await evaluate(conn, `(() => {
  const vids = document.querySelectorAll('video');
  const cans = document.querySelectorAll('canvas');
  return {
    url: location.href.slice(0, 80),
    videoCount: vids.length,
    videoInfo: [...vids].slice(0,3).map(v => ({ w: v.videoWidth, h: v.videoHeight, rs: v.readyState, paused: v.paused })),
    canvasCount: cans.length,
    canvasInfo: [...cans].slice(0,8).map(c => ({ w: c.width, h: c.height, cls: (c.className||'').toString().slice(0,40) })),
    iframes: document.querySelectorAll('iframe').length
  };
})()`);
console.log(JSON.stringify(r, null, 2));

// 如果有 iframe，检查里面的
if (r.iframes > 0) {
  const r2 = await evaluate(conn, `(() => {
    const fr = document.querySelectorAll('iframe');
    return [...fr].slice(0,5).map(f => {
      try {
        const d = f.contentDocument;
        return { src: (f.src||'').slice(0,60), vids: d ? d.querySelectorAll('video').length : 'no access',
                 cans: d ? d.querySelectorAll('canvas').length : 'no access' };
      } catch(e) { return { src: (f.src||'').slice(0,60), err: 'cross-origin' }; }
    });
  })()`);
  console.log('=== iframes ===');
  console.log(JSON.stringify(r2, null, 2));
}
process.exit(0);
