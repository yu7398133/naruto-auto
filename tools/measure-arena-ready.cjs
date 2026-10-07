// 离线测量：战斗准备界面「开始对战」按钮区域的蓝色占比
// [x,y,w,h] = [1120,600,92,52]  在 1280x720 逻辑空间
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const REGION = [1120, 600, 92, 52];
const BLUE = (R, G, B) => (B > 120 && B > R + 40 && G > R);

(async () => {
  const dir = process.argv[2];
  const files = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png)$/i.test(f)).sort();
  const data = files.map(f => ({
    name: f,
    url: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64'),
  }));

  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = await b.newPage();
  const res = await p.evaluate(async ({ data, REGION }) => {
    const load = (src) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = src; });
    const [x, y, w, h] = REGION;
    const out = [];
    for (const it of data) {
      let img;
      try { img = await load(it.url); } catch (e) { continue; }
      const c = document.createElement('canvas');
      c.width = 1280; c.height = 720;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, 1280, 720);
      const d = g.getImageData(x, y, w, h).data;
      let blue = 0, n = 0, sr = 0, sg = 0, sb = 0;
      for (let i = 0; i < d.length; i += 4) {
        const R = d[i], G = d[i + 1], B = d[i + 2];
        n++; sr += R; sg += G; sb += B;
        if (B > 120 && B > R + 40 && G > R) blue++;
      }
      out.push({
        name: it.name,
        bluePct: +(blue / n).toFixed(4),
        mean: [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)],
      });
    }
    return out;
  }, { data, REGION });

  console.log(`区域 [${REGION}]  共 ${res.length} 帧\n`);
  console.log('bluePct  ≈0.35(当前阈值) 的分布：');
  res.sort((a, b2) => b2.bluePct - a.bluePct);
  for (const r of res) {
    const mark = r.bluePct >= 0.35 ? '  ← 会命中' : '';
    console.log(`  ${String(r.bluePct).padStart(7)}  mean=${JSON.stringify(r.mean).padEnd(18)} ${r.name}${mark}`);
  }
  const hits = res.filter(r => r.bluePct >= 0.35);
  console.log(`\n当前阈值 0.35 命中 ${hits.length}/${res.length} 帧`);
  console.log(`最大 ${res[0].bluePct} / 最小 ${res[res.length-1].bluePct}`);
  await p.close(); await b.close();
})();
