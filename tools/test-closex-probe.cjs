// 直接实测 PROBES.closeX 与 PROBES.closeRed 在「丰饶入口页」和负样本上的表现
// 复刻 vision.match 的判据：区域内灰度均值 vs 目标色距离 + minStd
const fs = require('fs');
const { chromium } = require('playwright');

const IMG = 'C:\\Users\\chenyu\\dsh\\火影忍者\\abundance-done.png';

// 来自源码的探针定义
const PROBES = {
  closeX:    { area: [1185, 2, 1272, 70], color: { r: 102, g: 56, b: 34 }, tol: 35, minStd: 10 },
  closeRed:  { area: [1186, 0, 1280, 82], color: { r: 62,  g: 23, b: 8  }, tol: 35, minStd: 10 },
  backBtnX:  { area: [1040, 0, 1280, 120], color: { r: 170, g: 45, b: 14 }, tol: 45, minStd: 0 },
};

(async () => {
  const url = 'data:image/png;base64,' + fs.readFileSync(IMG).toString('base64');
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = await b.newPage();
  const out = await p.evaluate(async ({ url, PROBES }) => {
    const img = await new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = url; });
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, 1280, 720);
    const res = {};
    for (const [name, P] of Object.entries(PROBES)) {
      const [X1, Y1, X2, Y2] = P.area, W = X2 - X1, H = Y2 - Y1;
      const d = g.getImageData(X1, Y1, W, H).data;
      let n = 0, sr = 0, sg = 0, sb = 0, s2 = 0;
      for (let i = 0; i < d.length; i += 4) {
        const R = d[i], G = d[i + 1], B = d[i + 2];
        n++; sr += R; sg += G; sb += B;
        const L = 0.3 * R + 0.59 * G + 0.11 * B; s2 += L * L;
      }
      const mr = sr / n, mg = sg / n, mb = sb / n, ml = 0.3 * mr + 0.59 * mg + 0.11 * mb;
      const std = Math.sqrt(Math.max(0, s2 / n - ml * ml));
      // 源码 match 的判据：三通道均值与目标色距离 vs tol*3
      const dist = Math.abs(mr - P.color.r) + Math.abs(mg - P.color.g) + Math.abs(mb - P.color.b);
      const distOk = dist <= P.tol * 3;
      const stdOk = P.minStd ? std >= P.minStd : true;
      res[name] = {
        area: P.area, target: P.color, tol: P.tol, minStd: P.minStd,
        mean: [Math.round(mr), Math.round(mg), Math.round(mb)],
        std: +std.toFixed(2), dist: Math.round(dist), distLimit: P.tol * 3,
        distOk, stdOk, ok: distOk && stdOk,
      };
    }
    return res;
  }, { url, PROBES });

  console.log('在【丰饶入口页】截图上的表现（期望 closeX 命中）：\n');
  for (const [k, v] of Object.entries(out)) {
    console.log(`${k.padEnd(10)} area=${JSON.stringify(v.area)}`);
    console.log(`   目标色=${JSON.stringify(v.target)} tol=${v.tol}(距离上限${v.distLimit})`);
    console.log(`   实测均值=${JSON.stringify(v.mean)} std=${v.std}（minStd=${v.minStd}）`);
    console.log(`   距离=${v.dist} ${v.distOk ? '✓' : '✗'}   std ${v.stdOk ? '✓' : '✗'}   ⇒ ok=${v.ok}`);
    console.log('');
  }
  await p.close(); await b.close();
})();
