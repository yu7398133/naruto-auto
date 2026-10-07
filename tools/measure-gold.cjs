// 精确量金色确定按钮的边界（1920x1080 原图）→ 换算到 1280x720
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b64 = fs.readFileSync(process.argv[2]).toString('base64');
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = await b.contexts()[0].newPage();
  const r = await p.evaluate(async (dataUrl) => {
    const img = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl;
    });
    const W = img.width, H = img.height;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, W, H).data;
    const px = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const isGold = (r, g2, b2) => r > 150 && g2 > 120 && b2 < 110;

    // 在 y 620..740, x 700..1250 范围内精确找金色连通区边界
    let xmin = 1e9, xmax = -1, ymin = 1e9, ymax = -1;
    for (let y = 600; y < 760; y++)
      for (let x = 700; x < 1250; x++) {
        const [r2, g2, b2] = px(x, y);
        if (isGold(r2, g2, b2)) {
          if (x < xmin) xmin = x; if (x > xmax) xmax = x;
          if (y < ymin) ymin = y; if (y > ymax) ymax = y;
        }
      }
    // 逐行的 x 边界（看按钮真实形状）
    const rows = [];
    for (let y = 600; y < 760; y += 4) {
      let a = 1e9, c = -1, n = 0;
      for (let x = 700; x < 1250; x++) {
        const [r2, g2, b2] = px(x, y);
        if (isGold(r2, g2, b2)) { n++; if (x < a) a = x; if (x > c) c = x; }
      }
      if (n > 20) rows.push({ y, x1: a, x2: c, n });
    }
    // 按钮内均值
    let sr = 0, sg = 0, sb = 0, sn = 0;
    for (let y = ymin; y <= ymax; y++) for (let x = xmin; x <= xmax; x++) {
      const [r2, g2, b2] = px(x, y); sr += r2; sg += g2; sb += b2; sn++;
    }
    return {
      size: [W, H], bbox: [xmin, ymin, xmax, ymax],
      mean: [Math.round(sr / sn), Math.round(sg / sn), Math.round(sb / sn)],
      rows,
    };
  }, 'data:image/png;base64,' + b64).catch(e => ({ fatal: e.message }));
  await p.close(); await b.close();
  if (r.fatal) { console.log('ERR', r.fatal); return; }
  const [x1, y1, x2, y2] = r.bbox;
  console.log('原图', r.size.join('x'));
  console.log(`金色 bbox = [${r.bbox.join(', ')}]  按钮均值 (${r.mean.join(',')})`);
  console.log(`1280 坐标: [${(x1 / 1.5).toFixed(0)}, ${(y1 / 1.5).toFixed(0)}, ${(x2 / 1.5).toFixed(0)}, ${(y2 / 1.5).toFixed(0)}]`);
  console.log(`1280 中心: (${((x1 + x2) / 2 / 1.5).toFixed(0)}, ${((y1 + y2) / 2 / 1.5).toFixed(0)})`);
  console.log('\n逐行 x 边界（原图）:');
  for (const row of r.rows) console.log(`  y=${String(row.y).padStart(4)} x=[${row.x1},${row.x2}] n=${row.n}`);
})();
