// 在一个区域内统计「偏红」与「偏金」像素的占比 —— 用于区分「已领(红)」和「可领(金)」。
// 偏红: R 明显高于 G/B 且 B 不算太低（排除金色的低蓝）
// 偏金: R>G>B 且 B 很低
// 用法: node tools/red-vs-gold.cjs <img> "x1,y1,x2,y2" [...]
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const img = process.argv[2];
  const areas = process.argv.slice(3).map(s => s.split(',').map(Number));
  const mime = /\.png$/i.test(img) ? 'image/png' : 'image/jpeg';
  const b64 = fs.readFileSync(img).toString('base64');

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = await browser.contexts()[0].newPage();
  await page.setContent('<canvas id=c></canvas>');
  const out = await page.evaluate(async ({ b64, mime, areas }) => {
    const im = new Image(); im.src = `data:${mime};base64,` + b64; await im.decode();
    const c = document.getElementById('c');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0);
    const sx = im.naturalWidth / 1280, sy = im.naturalHeight / 720;
    const res = [];
    for (const a of areas) {
      const lx = Math.round(a[0] * sx), ly = Math.round(a[1] * sy);
      const lw = Math.max(1, Math.round((a[2] - a[0]) * sx)), lh = Math.max(1, Math.round((a[3] - a[1]) * sy));
      const d = ctx.getImageData(lx, ly, lw, lh).data;
      let n = 0, red = 0, gold = 0;
      // 代表性像素（偏红/偏金各取一个样本）
      let redSample = null, goldSample = null;
      for (let i = 0; i < d.length; i += 4) {
        const R = d[i], G = d[i + 1], B = d[i + 2];
        n++;
        // 红：R 高、R-G 大、且 B 不低于 G（红里带点白/粉），排除金色的低蓝
        if (R > 120 && (R - G) > 35 && B >= G - 15 && B > 60) { red++; if (!redSample) redSample = [R, G, B]; }
        // 金：R>G>B 且 B 很低
        else if (R > 150 && G > 115 && B < 105 && (G - B) > 40) { gold++; if (!goldSample) goldSample = [R, G, B]; }
      }
      res.push({
        logical: a, px: lw + 'x' + lh,
        redPct: +(red / n * 100).toFixed(1), goldPct: +(gold / n * 100).toFixed(1),
        redSample, goldSample,
      });
    }
    return { size: im.naturalWidth + 'x' + im.naturalHeight, res };
  }, { b64, mime, areas });

  console.log('图:', out.size);
  for (const r of out.res) {
    console.log(
      '[' + r.logical.join(',') + ']'.padEnd(2), r.px.padStart(7),
      ' 红%=' + String(r.redPct).padStart(5), '样本' + JSON.stringify(r.redSample),
      ' | 金%=' + String(r.goldPct).padStart(5), '样本' + JSON.stringify(r.goldSample)
    );
  }
  await page.close(); await browser.close();
})();
