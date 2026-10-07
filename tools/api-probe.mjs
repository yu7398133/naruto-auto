import { listPages, connect, evaluate } from './cdp.mjs';

const pages = await listPages();
const game = pages.find(p => p.type === 'page' && p.title.includes('火影忍者'));
const conn = await connect(game.webSocketDebuggerUrl);
await conn.send('Runtime.enable');

const info = await evaluate(conn, `(() => {
  const a = window.__narutoAuto;
  const out = {};
  out.coordsKeys = Object.keys(a.coords || {});
  // NAV 相关
  out.hasNav = !!a.nav;
  if (a.nav) out.navKeys = Object.keys(a.nav);
  // click 的签名
  out.clickSrc = (a.click && a.click.toString) ? a.click.toString().slice(0, 600) : 'n/a';
  // 场景
  try {
    const s = a.scenes.detect();
    out.scene = s.scene; out.byProbe = s.byProbe; out.brightness = s.brightness;
  } catch (e) { out.sceneErr = e.message; }
  // 视频与 canvas 的实际布局（用于算点击换算）
  const v = document.querySelector('video');
  if (v) {
    const r = v.getBoundingClientRect();
    out.video = { iw: v.videoWidth, ih: v.videoHeight, dispW: Math.round(r.width), dispH: Math.round(r.height),
                  left: Math.round(r.left), top: Math.round(r.top), winW: innerWidth, winH: innerHeight, dpr: devicePixelRatio };
  }
  return out;
})()`);

console.log(JSON.stringify(info, null, 2));
conn.close();
