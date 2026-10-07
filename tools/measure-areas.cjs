// 在给定图上测量若干小区域的平均色 / std（复刻脚本 Vision.avg 的加权亮度算法）。
// 用法：node tools/measure-areas.cjs <img.png> "x1,y1,x2,y2" ["x1,y1,x2,y2" ...]
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
      let R = 0, G = 0, B = 0, n = 0, s = 0, s2 = 0;
      for (let i = 0; i < d.length; i += 4) {
        R += d[i]; G += d[i + 1]; B += d[i + 2];
        const l = (d[i] * 77 + d[i + 1] * 151 + d[i + 2] * 28) >> 8;
        s += l; s2 += l * l; n++;
      }
      R /= n; G /= n; B /= n;
      const mean = s / n;
      res.push({
        logical: a, px: lw + 'x' + lh,
        rgb: [Math.round(R), Math.round(G), Math.round(B)],
        std: Math.round(Math.sqrt(Math.max(0, s2 / n - mean * mean))),
      });
    }
    return { size: im.naturalWidth + 'x' + im.naturalHeight, res };
  }, { b64, mime, areas });

  console.log('图尺寸(物理):', out.size);
  for (const r of out.res) {
    console.log(
      '[' + r.logical.join(',') + ']'.padEnd(2),
      r.px.padStart(7),
      ' rgb=(' + r.rgb.join(',') + ')',
      ' std=' + r.std
    );
  }
  await page.close(); await browser.close();
})();
