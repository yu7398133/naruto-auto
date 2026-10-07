// 再测一次 + 同时抓图，确认画面真实状态
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages().find(x => /start\.qq\.com\/game/.test(x.url()));
  const r = await p.evaluate(async () => {
    const A = window.__narutoAuto;
    A.vision.capture(true);
    const ctx = A.scheduler.ctx;
    const out = { ver: A.runtime.version };
    try { out.scene = A.scenes.detect(false); } catch (e) { out.scene = e.message; }
    out.prep = await ctx.atSecretRealmPrep();
    out.exitC = ctx.detectExitConfirm();
    out.ticket = await ctx.readTicketCount();
    // 券数区均值（看画面里到底有没有数字）
    const g = A.vision.canvas.getContext('2d', { willReadFrequently: true });
    const d = g.getImageData(496, 620, 40, 52).data;
    let r2 = 0, g2 = 0, b2 = 0, n = 0, bright = 0;
    for (let i = 0; i < d.length; i += 4) {
      r2 += d[i]; g2 += d[i + 1]; b2 += d[i + 2]; n++;
      if (d[i] > 150) bright++;
    }
    out.ticketArea = { mean: [Math.round(r2 / n), Math.round(g2 / n), Math.round(b2 / n)], brightPct: +(bright / n).toFixed(3) };
    out.shot = A.vision.canvas.toDataURL('image/png');
    return out;
  }).catch(e => ({ fatal: e.message }));
  if (r.fatal) { console.log(r.fatal); await b.close(); return; }
  const f = path.resolve(__dirname, '..', 'trace-frames', 'probe-check.png');
  fs.writeFileSync(f, Buffer.from(r.shot.split(',')[1], 'base64'));
  delete r.shot;
  console.log(JSON.stringify(r, null, 1));
  console.log('\n截图 →', f);
  await b.close();
})();
