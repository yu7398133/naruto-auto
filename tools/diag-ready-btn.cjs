// 诊断：在用户录制的真实帧里，看 (1165,629)「开始对战」位置附近到底是什么
// 以及从录像 JSON 里找「点开始对战」那一刻的帧 —— 那帧必定是准备界面
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const REGIONS = {
  '开始对战按钮 [1120,600,92,52]': [1120, 600, 92, 52],
  '按钮中心小样 [1150,615,30,28]': [1150, 615, 30, 28],
  '全底栏 [900,580,380,110]': [900, 580, 380, 110],
};

(async () => {
  const dir = process.argv[2];
  const only = process.argv[3];   // 可选：只看某几帧（逗号分隔）
  let files = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png)$/i.test(f)).sort();
  if (only) files = files.filter(f => only.split(',').some(o => f.includes(o)));
  const data = files.map(f => ({
    name: f, url: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64'),
  }));

  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = await b.newPage();
  const res = await p.evaluate(async ({ data, REGIONS }) => {
    const load = (src) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = src; });
    const out = [];
    for (const it of data) {
      let img; try { img = await load(it.url); } catch (e) { continue; }
      const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
      c.getContext('2d').drawImage(img, 0, 0, 1280, 720);
      const g = c.getContext('2d');
      const row = { name: it.name };
      for (const [label, [x, y, w, h]] of Object.entries(REGIONS)) {
        const d = g.getImageData(x, y, w, h).data;
        let sr = 0, sg = 0, sb = 0, n = 0, blue = 0, bright = 0;
        for (let i = 0; i < d.length; i += 4) {
          const R = d[i], G = d[i + 1], B = d[i + 2];
          n++; sr += R; sg += G; sb += B;
          if (B > 120 && B > R + 40 && G > R) blue++;
          if (R + G + B > 300) bright++;
        }
        row[label] = {
          mean: [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)],
          bluePct: +(blue / n).toFixed(3),
          brightPct: +(bright / n).toFixed(3),
        };
      }
      out.push(row);
    }
    return out;
  }, { data, REGIONS });

  for (const r of res) {
    console.log(`\n${r.name}`);
    for (const k of Object.keys(REGIONS)) {
      const v = r[k];
      console.log(`   ${k.padEnd(30)} mean=${JSON.stringify(v.mean).padEnd(16)} blue=${v.bluePct}  bright=${v.brightPct}`);
    }
  }
  await p.close(); await b.close();
})();
