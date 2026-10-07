import { listPages, connect, evaluate } from './cdp.mjs';

const pages = await listPages();
const g = pages.find(p => p.type === 'page' && /arm-game|start\.qq\.com/.test(p.url || ''));
const conn = await connect(g.webSocketDebuggerUrl);

const r = await evaluate(conn, `(() => {
  const out = {};
  const na = window.__narutoAuto;
  out.hasApi = typeof na !== 'undefined';
  if (!out.hasApi) return out;
  out.apis = Object.keys(na);
  out.hasPanel = !!na.panel;
  try { out.panelVisible = na.panel ? na.panel.visible : null; } catch (e) { out.panelErr = e.message; }
  try { out.appVersion = na.app ? na.app.VERSION : null; } catch (e) { out.appErr = e.message; }

  // 找所有可能是悬浮窗的根元素
  const cands = [...document.querySelectorAll('div,aside,section')].filter(el => {
    const cs = getComputedStyle(el);
    const z = parseInt(cs.zIndex || '0', 10);
    return (cs.position === 'fixed' || cs.position === 'absolute') && (z > 10000 || el.id);
  });
  out.cands = cands.slice(0, 12).map(el => ({
    id: el.id || '(none)',
    cls: (el.className || '').toString().slice(0, 40),
    pos: getComputedStyle(el).position,
    disp: getComputedStyle(el).display,
    vis: getComputedStyle(el).visibility,
    op: getComputedStyle(el).opacity,
    z: getComputedStyle(el).zIndex,
    w: el.offsetWidth, h: el.offsetHeight,
    // 关键：父链上有没有 display:none
    offscreen: (() => { let p = el, bad = []; while (p && p !== document.body) { const c = getComputedStyle(p); if (c.display === 'none' || c.visibility === 'hidden') bad.push((p.id || p.tagName) + ':' + c.display + '/' + c.visibility); p = p.parentElement; } return bad; })(),
  }));
  out.bodyChildren = document.body ? document.body.children.length : -1;
  return out;
})()`, { awaitPromise: true });
console.log(JSON.stringify(r, null, 2));
conn.close();
