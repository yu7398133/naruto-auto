import { listPages, connect, evaluate } from './cdp.mjs';

const pages = await listPages();
for (const p of pages.filter(x => x.type === 'page')) {
  if (!/start\.qq\.com/.test(p.url || '')) continue;
  console.log('\n########', p.title);
  console.log('   ', p.url.slice(0, 90));
  const conn = await connect(p.webSocketDebuggerUrl);
  const r = await evaluate(conn, `(() => {
    const out = {};
    out.hasApi = typeof window.__narutoAuto !== 'undefined';
    if (out.hasApi) {
      try { out.version = window.__narutoAuto.app ? window.__narutoAuto.app.VERSION : null; } catch(e){}
      try { out.panelVisible = window.__narutoAuto.panel ? window.__narutoAuto.panel.visible : null; } catch(e){ out.panelErr = e.message; }
      out.apis = Object.keys(window.__narutoAuto).length;
    }
    const cands = [...document.querySelectorAll('div,aside,section')].filter(el => {
      const cs = getComputedStyle(el);
      const z = parseInt(cs.zIndex || '0', 10);
      return (cs.position === 'fixed') && (z > 10000 || /naruto|auto|panel|dsh/i.test(el.id + (el.className||'')));
    });
    out.fixedCands = cands.slice(0, 10).map(el => ({
      id: el.id || '(none)', cls: (el.className||'').toString().slice(0,44),
      disp: getComputedStyle(el).display, vis: getComputedStyle(el).visibility,
      op: getComputedStyle(el).opacity, z: getComputedStyle(el).zIndex,
      w: el.offsetWidth, h: el.offsetHeight,
      parentHidden: (()=>{ let q=el.parentElement,bad=[]; while(q&&q!==document.documentElement){const c=getComputedStyle(q); if(c.display==='none')bad.push(q.id||q.tagName); q=q.parentElement;} return bad; })(),
    }));
    out.bodyDirectChildren = [...(document.body?document.body.children:[])].map(el => el.tagName + (el.id?'#'+el.id:''));
    return out;
  })()`, { awaitPromise: true });
  console.log(JSON.stringify(r, null, 2));
  conn.close();
}
