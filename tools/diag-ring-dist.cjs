// 诊断：红/蓝像素在整帧上的**空间分布**，看它们到底是不是「人物脚下的光圈」
// 输出：把画面横向分成 16 列，看红/蓝像素落在哪些列；并给出纵向分布
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

(async () => {
  const dir = process.argv[2];
  const names = (process.argv[3] || '').split(',').filter(Boolean);
  let files = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png)$/i.test(f)).sort();
  if (names.length) files = files.filter(f => names.includes(f));
  const data = files.map(f => ({ name: f, url: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64') }));

  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = await b.newPage();
  const res = await p.evaluate(async ({ data }) => {
    const load = s => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = s; });
    const COLS = 16, ROWS = 12;
    const out = [];
    for (const it of data) {
      let img; try { img = await load(it.url); } catch (e) { continue; }
      const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, 1280, 720);
      const d = g.getImageData(0, 0, 1280, 720).data;
      const colR = new Array(COLS).fill(0), colB = new Array(COLS).fill(0);
      const rowR = new Array(ROWS).fill(0), rowB = new Array(ROWS).fill(0);
      let redN = 0, blueN = 0;
      for (let y = 0; y < 720; y++) {
        for (let x = 0; x < 1280; x++) {
          const i = (y * 1280 + x) * 4;
          const R = d[i], G = d[i + 1], B = d[i + 2];
          const cx = Math.min(COLS - 1, Math.floor(x / (1280 / COLS)));
          const cy = Math.min(ROWS - 1, Math.floor(y / (720 / ROWS)));
          if (R > 120 && R > G + 45 && R > B + 45) { redN++; colR[cx]++; rowR[cy]++; }
          if (B > 120 && B > R + 45 && B > G + 30) { blueN++; colB[cx]++; rowB[cy]++; }
        }
      }
      out.push({ name: it.name, redN, blueN, colR, colB, rowR, rowB });
    }
    return out;
  }, { data });

  for (const r of res) {
    console.log(`\n═══ ${r.name}  红=${r.redN} 蓝=${r.blueN}`);
    const bar = (arr, total) => arr.map(v => {
      if (!total || v === 0) return '·';
      const p2 = v / total;
      return p2 > 0.25 ? '#' : p2 > 0.10 ? '+' : p2 > 0.02 ? '-' : '·';
    }).join('');
    console.log(`  红 列: ${bar(r.colR, r.redN)}   (左→右 16 列)`);
    console.log(`  蓝 列: ${bar(r.colB, r.blueN)}`);
    console.log(`  红 行: ${bar(r.rowR, r.redN)}   (上→下 12 行)`);
    console.log(`  蓝 行: ${bar(r.rowB, r.blueN)}`);
  }
  await p.close(); await b.close();
})();
