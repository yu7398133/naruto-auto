// 准备界面探针 —— 用用户指定的**蓝色感叹号** @ (1108,128)
// 图标实测框：(1085,108)-(1120,149) → 取核心 [1090,112,26,32]，留少量余量
// 正样本：a001.jpg（vision 已确认是准备界面）
// 负样本：其余 70 帧（战斗中/结算/黑屏/ loading）
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SETS = {
  '感叹号核心 [1090,112,26,32]': [1090, 112, 26, 32],
  '感叹号外扩 [1085,108,35,41]': [1085, 108, 35, 41],
  '感叹号紧框 [1092,114,22,28]': [1092, 114, 22, 28],
};

(async () => {
  const dir = process.argv[2];
  const files = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png)$/i.test(f)).sort();
  const data = files.map(f => ({
    name: f, url: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64'),
  }));
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = await b.newPage();
  const res = await p.evaluate(async ({ data, SETS }) => {
    const load = (s) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = s; });
    const out = [];
    for (const it of data) {
      let img; try { img = await load(it.url); } catch (e) { continue; }
      const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, 1280, 720);
      const row = { name: it.name, m: {} };
      for (const [label, [x, y, w, h]] of Object.entries(SETS)) {
        const d = g.getImageData(x, y, w, h).data;
        let n = 0, blue = 0, sr = 0, sg = 0, sb = 0;
        for (let i = 0; i < d.length; i += 4) {
          const R = d[i], G = d[i + 1], B = d[i + 2];
          n++; sr += R; sg += G; sb += B;
          // 蓝色图标：B 明显高于 R，且有一定亮度（不是暗背景）
          if (B > 90 && B > R + 45 && B >= G) blue++;
        }
        row.m[label] = { blue: +(blue / n).toFixed(4), mean: [Math.round(sr/n), Math.round(sg/n), Math.round(sb/n)] };
      }
      out.push(row);
    }
    return out;
  }, { data, SETS });

  const pos = res.find(r => r.name === 'a001.jpg');
  const neg = res.filter(r => r.name !== 'a001.jpg');
  for (const label of Object.keys(SETS)) {
    const pv = pos.m[label].blue;
    const nv = neg.map(r => r.m[label].blue);
    const maxNeg = Math.max(...nv), minNeg = Math.min(...nv);
    const ok = maxNeg < pv;
    console.log(`\n【${label}】`);
    console.log(`  正样本 a001 : blue=${pv}   mean=${JSON.stringify(pos.m[label].mean)}`);
    console.log(`  负样本 ${neg.length} 张 : blue ${minNeg}~${maxNeg}`);
    if (ok) {
      console.log(`  ✅ 可分！间隙 ${(pv - maxNeg).toFixed(4)}`);
      console.log(`  → 建议阈值 = ${((pv + maxNeg) / 2).toFixed(4)}（正 ${pv} / 负最大 ${maxNeg}）`);
      const thr = (pv + maxNeg) / 2;
      console.log(`     余量：距正 ${(pv - thr).toFixed(4)} / 距负 ${(thr - maxNeg).toFixed(4)}`);
    } else {
      console.log(`  ❌ 不可分：负样本最大 ${maxNeg} ≥ 正样本 ${pv}`);
      neg.filter(r => r.m[label].blue >= pv).slice(0, 5).forEach(r =>
        console.log(`      冲突样本 ${r.name} blue=${r.m[label].blue}`));
    }
  }
  await p.close(); await b.close();
})();
