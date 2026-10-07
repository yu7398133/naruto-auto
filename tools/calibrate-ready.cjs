// 用**实测的正确区域**做准备界面探针的两态校准
// 正样本：a001.jpg（已由 vision 确认是准备界面，右下角金色「开战」1094,533-1278,720）
// 负样本：其余 70 帧（战斗中 / 结算 / 黑屏）
// 区域取按钮内部核心区（避开边缘），[x,y,w,h]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const CANDIDATES = {
  '核心区 [1150,600,110,80]': [1150, 600, 110, 80],
  '更大区 [1120,570,140,110]': [1120, 570, 140, 110],
  '按钮中心 [1160,620,70,60]': [1160, 620, 70, 60],
};

(async () => {
  const dir = process.argv[2];
  const files = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png)$/i.test(f)).sort();
  const data = files.map(f => ({
    name: f, url: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64'),
  }));

  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = await b.newPage();
  const res = await p.evaluate(async ({ data, CANDIDATES }) => {
    const load = (s) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = s; });
    const out = [];
    for (const it of data) {
      let img; try { img = await load(it.url); } catch (e) { continue; }
      const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, 1280, 720);
      const row = { name: it.name, m: {} };
      for (const [label, [x, y, w, h]] of Object.entries(CANDIDATES)) {
        const d = g.getImageData(x, y, w, h).data;
        let n = 0, bright = 0, gold = 0, sr = 0, sg = 0, sb = 0;
        for (let i = 0; i < d.length; i += 4) {
          const R = d[i], G = d[i + 1], B = d[i + 2];
          n++; sr += R; sg += G; sb += B;
          if (R + G + B > 300) bright++;
          // 金色：红>绿>蓝，且红够高
          if (R > 150 && R > B + 50 && G > B) gold++;
        }
        row.m[label] = {
          bright: +(bright / n).toFixed(4),
          gold: +(gold / n).toFixed(4),
          mean: [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)],
        };
      }
      out.push(row);
    }
    return out;
  }, { data, CANDIDATES });

  const pos = res.find(r => r.name === 'a001.jpg');
  const neg = res.filter(r => r.name !== 'a001.jpg');
  for (const label of Object.keys(CANDIDATES)) {
    const pv = pos.m[label];
    const nb = neg.map(r => r.m[label].bright);
    const ng = neg.map(r => r.m[label].gold);
    console.log(`\n【${label}】`);
    console.log(`  正样本 a001:  bright=${pv.bright}  gold=${pv.gold}  mean=${JSON.stringify(pv.mean)}`);
    console.log(`  负样本 ${neg.length} 张: bright ${Math.min(...nb).toFixed(4)}~${Math.max(...nb).toFixed(4)}`
      + `  | gold ${Math.min(...ng).toFixed(4)}~${Math.max(...ng).toFixed(4)}`);
    const sBright = Math.max(...nb) < pv.bright;
    const sGold = Math.max(...ng) < pv.gold;
    console.log(`  bright 可分: ${sBright ? '✅' : '❌'}  (正 ${pv.bright} vs 负最大 ${Math.max(...nb).toFixed(4)})`);
    console.log(`  gold   可分: ${sGold ? '✅' : '❌'}  (正 ${pv.gold} vs 负最大 ${Math.max(...ng).toFixed(4)})`);
    if (sBright) console.log(`  → 建议 bright 阈值 ∈ (${Math.max(...nb).toFixed(3)}, ${pv.bright}) 中点 ${((Math.max(...nb) + pv.bright) / 2).toFixed(3)}`);
    if (sGold) console.log(`  → 建议 gold 阈值   ∈ (${Math.max(...ng).toFixed(3)}, ${pv.gold}) 中点 ${((Math.max(...ng) + pv.gold) / 2).toFixed(3)}`);
  }
  await p.close(); await b.close();
})();
