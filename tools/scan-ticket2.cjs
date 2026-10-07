// 用页面内可见的券数模板（从脚本里抠 dataURL）横扫找数字真实位置。
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  // 从脚本文件里抠出模板 dataURL
  const src = fs.readFileSync(process.argv[2], 'utf8');
  const m = src.match(/const SECRET_REALM_TICKET_TEMPLATES = (\{[\s\S]*?\});/);
  if (!m) { console.log('未找到模板声明'); return; }
  const tmpls = JSON.parse(m[1]);
  console.log('模板键:', Object.keys(tmpls).join(','));

  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages().find(x => /start\.qq\.com\/game/.test(x.url()));
  const r = await p.evaluate(async (t) => {
    const A = window.__narutoAuto;
    A.vision.capture(true);
    // 解析所有模板
    const cvs = {};
    for (const [k, url] of Object.entries(t)) {
      const img = await new Promise((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
      });
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      cvs[k] = c;
    }
    const out = { tmplSize: [Object.values(cvs)[0].width, Object.values(cvs)[0].height], probes: [] };
    // 横扫 x0，y 也扫几个值
    for (let y0 = 600; y0 <= 660; y0 += 6) {
      const row = [];
      for (let x0 = 420; x0 <= 640; x0 += 4) {
        let best = null, bestScore = Infinity;
        for (const [k, cv] of Object.entries(cvs)) {
          if (cv.width > 40 || cv.height > 52) continue;
          const res = A.vision.findTemplate(cv, [x0, y0, x0 + 44, y0 + 56], { step: 1, thresh: 40 });
          if (res.ok && res.score < bestScore) { bestScore = res.score; best = k; }
        }
        row.push({ x0, best, score: bestScore === Infinity ? null : +bestScore.toFixed(1) });
      }
      out.probes.push({ y0, row });
    }
    return out;
  }, tmpls).catch(e => ({ fatal: e.message }));
  await b.close();
  if (r.fatal) { console.log(r.fatal); return; }
  console.log('模板尺寸', r.tmplSize.join('x'));
  for (const { y0, row } of r.probes) {
    const hits = row.filter(q => q.best);
    if (!hits.length) { console.log(`y0=${y0}: 无命中`); continue; }
    console.log(`y0=${y0}: ` + hits.map(q => `x${q.x0}→"${q.best}"(${q.score})`).join('  '));
  }
})();
