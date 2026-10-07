// 最终校准：蓝色感叹号「规则说明」在 (1108,128)，框 [1092,114,22,28]
// 判据：B-R 落在「青蓝」区间（排除 a056 那种全屏饱和蓝过场）
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const BOX = [1092, 114, 22, 28];

(async () => {
  const dir = process.argv[2];
  const files = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png)$/i.test(f)).sort();
  const data = files.map(f => ({ name: f, url: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64') }));
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = await b.newPage();
  const res = await p.evaluate(async ({ data, BOX }) => {
    const load = s => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = s; });
    const [x, y, w, h] = BOX;
    const out = [];
    for (const it of data) {
      let img; try { img = await load(it.url); } catch (e) { continue; }
      const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, 1280, 720);
      const d = g.getImageData(x, y, w, h).data;
      let sr = 0, sg = 0, sb = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; n++; }
      const R = sr / n, G = sg / n, B = sb / n;
      // 全屏是否整体偏蓝（用于排除蓝色过场）
      const fd = g.getImageData(0, 0, 1280, 720).data;
      let fr = 0, fg = 0, fb = 0, fn = 0;
      for (let i = 0; i < fd.length; i += 4 * 17) { fr += fd[i]; fg += fd[i + 1]; fb += fd[i + 2]; fn++; }
      const FR = fr / fn, FB = fb / fn;
      out.push({
        name: it.name,
        mean: [Math.round(R), Math.round(G), Math.round(B)],
        bd: Math.round(B - R),                    // B-R
        fullBD: Math.round(FB - FR),              // 全屏 B-R
      });
    }
    return out;
  }, { data, BOX });

  const pos = res.find(r => r.name === 'a001.jpg');
  const neg = res.filter(r => r.name !== 'a001.jpg');
  console.log(`正样本 a001: mean=${JSON.stringify(pos.mean)}  B-R=${pos.bd}  全屏B-R=${pos.fullBD}`);

  // 判据：B-R ∈ [LO,HI] 且 全屏B-R < FULLMAX
  const LO = 15, HI = 60, FULLMAX = 40;
  const pass = (r) => r.bd >= LO && r.bd <= HI && r.fullBD < FULLMAX;
  console.log(`\n判据: B-R ∈ [${LO},${HI}] 且 全屏B-R < ${FULLMAX}\n`);
  console.log('负样本中「会误命中」的帧:');
  let bad = 0;
  neg.forEach(r => { if (pass(r)) { console.log(`  ${r.name}  mean=${JSON.stringify(r.mean)} B-R=${r.bd} 全屏B-R=${r.fullBD}`); bad++; } });
  if (!bad) console.log('  （无）');
  const negBd = neg.map(r => r.bd);
  console.log(`\n负样本 B-R 范围: ${Math.min(...negBd)} ~ ${Math.max(...negBd)}`);
  console.log(`正样本 B-R = ${pos.bd}`);
  console.log(`\n结果: ${bad === 0 ? '✅ 零误报，可分' : `❌ ${bad} 个误报`}`);
  // 列出最接近的负样本
  neg.map(r => ({ n: r.name, d: Math.abs(r.bd - pos.bd) })).sort((a, b) => a.d - b.d).slice(0, 5)
    .forEach(r => console.log(`  最近负样本 ${r.n}  B-R差=${r.d}`));
  await p.close(); await b.close();
})();
