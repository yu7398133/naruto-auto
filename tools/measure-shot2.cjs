// 量用户截图（1920x1080）里关键区域，归一到 1280x720 后给出颜色/方差
const fs = require('fs');
const { chromium } = require('playwright');

const IMG = 'C:\\Users\\chenyu\\dsh\\火影忍者\\abundance-done.png';

const REGIONS = {
  'returnBtn-icon': [37, 655, 94, 698],
  'returnBtn-full': [41, 658, 182, 709],
  'backBtnX-all': [1040, 0, 1280, 120],
  'closeX-area': [1185, 2, 1272, 70],
};

(async () => {
  const url = 'data:image/png;base64,' + fs.readFileSync(IMG).toString('base64');
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = await b.newPage();
  const out = await p.evaluate(async ({ url, REGIONS }) => {
    const img = await new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = url; });
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, 1280, 720);
    const res = {};
    for (const [name, [X1, Y1, X2, Y2]] of Object.entries(REGIONS)) {
      const W = X2 - X1, H = Y2 - Y1;
      const d = g.getImageData(X1, Y1, W, H).data;
      let n = 0, sr = 0, sg = 0, sb = 0, s2 = 0, minL = 999, maxL = -1, redish = 0;
      for (let i = 0; i < d.length; i += 4) {
        const R = d[i], G = d[i + 1], B = d[i + 2];
        n++; sr += R; sg += G; sb += B;
        const L = 0.3 * R + 0.59 * G + 0.11 * B;
        s2 += L * L; if (L < minL) minL = L; if (L > maxL) maxL = L;
        if (R > 120 && R > G + 45 && R > B + 45) redish++;
      }
      const mr = sr / n, mg = sg / n, mb = sb / n, ml = 0.3 * mr + 0.59 * mg + 0.11 * mb;
      res[name] = {
        area: [X1, Y1, X2, Y2], size: W + 'x' + H,
        mean: [Math.round(mr), Math.round(mg), Math.round(mb)],
        std: +Math.sqrt(Math.max(0, s2 / n - ml * ml)).toFixed(2),
        lum: [Math.round(minL), Math.round(maxL)],
        redPct: +(redish / n).toFixed(4),
      };
    }
    return res;
  }, { url, REGIONS });

  for (const [k, v] of Object.entries(out)) {
    console.log('\n' + k);
    console.log('  area=' + JSON.stringify(v.area) + ' ' + v.size);
    console.log('  mean=' + JSON.stringify(v.mean) + ' std=' + v.std + ' lum=[' + v.lum + '] redPct=' + v.redPct);
  }
  await p.close(); await b.close();
})();
