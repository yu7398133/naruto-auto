// 分析券数区到底有没有数字：逐列/逐行找亮像素（数字应是亮黄/白，背景暗）
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
    const out = { size: [W, H] };

    // 券数区附近大范围扫描：x 430..600, y 600..700，找亮像素分布
    out.cols = [];
    for (let x = 430; x < 600; x += 4) {
      let n = 0, mx = 0, sum = 0;
      for (let y = 600; y < 700; y++) {
        const [R, G, B] = px(x, y);
        const v = Math.max(R, G, B);
        sum += v;
        if (v > 140) n++;
        if (v > mx) mx = v;
      }
      out.cols.push({ x, bright: n, max: mx, avg: Math.round(sum / 100) });
    }
    out.rows = [];
    for (let y = 600; y < 700; y += 4) {
      let n = 0, mx = 0;
      for (let x = 440; x < 560; x++) {
        const [R, G, B] = px(x, y);
        const v = Math.max(R, G, B);
        if (v > 140) n++;
        if (v > mx) mx = v;
      }
      out.rows.push({ y, bright: n, max: mx });
    }
    return out;
  }, 'data:image/png;base64,' + b64).catch(e => ({ fatal: e.message }));
  await p.close(); await b.close();
  if (r.fatal) { console.log('ERR', r.fatal); return; }
  console.log('尺寸', r.size.join('x'));
  console.log('\n逐列（x 430..600, y600..700）亮像素数 / 最大亮度:');
  for (const c of r.cols) {
    console.log(`  x=${String(c.x).padStart(3)} bright=${String(c.bright).padStart(3)} max=${String(c.max).padStart(3)} avg=${String(c.avg).padStart(3)} ${'#'.repeat(Math.min(40, c.bright))}`);
  }
  console.log('\n逐行（y 600..700, x440..560）:');
  for (const c of r.rows) {
    console.log(`  y=${String(c.y).padStart(3)} bright=${String(c.bright).padStart(3)} max=${String(c.max).padStart(3)} ${'#'.repeat(Math.min(40, c.bright))}`);
  }
})();
