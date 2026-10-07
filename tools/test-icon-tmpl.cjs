// 用裁出的图标模板跑 findTemplate，看分数与稳定性；并验证其它区域不误命中。
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const url = fs.readFileSync(path.resolve(__dirname, '..', 'trace-frames', 'icon-tmpl.txt'), 'utf8').trim();
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages().find(x => /start\.qq\.com\/game/.test(x.url()));
  const r = await p.evaluate(async (dataUrl) => {
    const A = window.__narutoAuto;
    // 把 dataURL 变成 image，供 findTemplate 用（和 loadTicketTemplates 同路）
    const img = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl;
    });
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    cv.getContext('2d').drawImage(img, 0, 0);

    const out = { tmplSize: [img.width, img.height], runs: [] };
    // ⚠ region 是 [x1,y1,x2,y2]（不是 x,y,w,h）—— findTemplate 内部用 R[2]-R[0]
    const REGION = [440, 615, 510, 680];
    for (let i = 0; i < 5; i++) {
      A.vision.capture(true);
      const t0 = performance.now();
      const res = A.vision.findTemplate(cv, REGION, { step: 1, thresh: 40 });
      out.runs.push({
        i, ms: Math.round(performance.now() - t0),
        ok: res.ok, score: +(res.score || 0).toFixed(2),
        cx: res.cx, cy: res.cy,
      });
    }
    // 反例：在同一张图上把模板拿到别处找（不该命中低分）
    const NEG = [
      ['屏幕中央', [600, 300, 760, 440]],
      ['左上角', [20, 20, 160, 140]],
      ['右下角', [1100, 620, 1240, 710]],
    ];
    out.neg = [];
    for (const [name, reg] of NEG) {
      A.vision.capture(true);
      const res = A.vision.findTemplate(cv, reg, { step: 1, thresh: 40 });
      out.neg.push({ name, ok: res.ok, score: +(res.score || 0).toFixed(2), cx: res.cx, cy: res.cy });
    }
    return out;
  }, url).catch(e => ({ fatal: e.message }));
  if (r.fatal) { console.log(r.fatal); await b.close(); return; }
  console.log('模板尺寸:', r.tmplSize.join('x'));
  console.log('\n目标区 [440,615,70,65] 连续 5 次:');
  for (const x of r.runs) console.log(`  #${x.i} ${String(x.ms).padStart(3)}ms ok=${x.ok} score=${String(x.score).padStart(6)} @(${x.cx},${x.cy})`);
  console.log('\n反例（同图上别处找）:');
  for (const x of r.neg) console.log(`  ${x.name.padEnd(8)} ok=${x.ok} score=${String(x.score).padStart(6)} @(${x.cx},${x.cy})`);
  await b.close();
})();
