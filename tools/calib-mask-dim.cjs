// 标定「遮罩变暗」判据：在候选背景区域上对比「有遮罩」vs「无遮罩」的亮度。
// 复用脚本 Vision.avg 的算法（加权亮度 (77,151,28)>>8，区域均值 + std）。
// 用法：node tools/calib-mask-dim.cjs <有遮罩.png> <无遮罩.png>
const { chromium } = require('playwright');

// 候选采样区（1280x720 逻辑坐标）——挑「远离中央对话框」的位置：
// 左上、右上、左下、右下、以及左右中带。全部避开中间的弹窗。
const AREAS = {
  topLeft:    [30, 60, 240, 190],
  topRight:   [1040, 60, 1250, 190],
  bottomLeft: [30, 540, 240, 690],
  bottomRight:[1040, 540, 1250, 690],
  midLeft:    [30, 300, 170, 440],
  midRight:   [1110, 300, 1250, 440],
  // 右上角红叉所在（用户指出「红叉也变暗」）
  redX:       [1185, 2, 1272, 70],
};

(async () => {
  const [maskImg, plainImg] = process.argv.slice(2);
  const fs = require('fs');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = await browser.contexts()[0].newPage();
  await page.setContent('<canvas id=c></canvas>');

  const measure = async fp => {
    const b64 = fs.readFileSync(fp).toString('base64');
    return page.evaluate(async ({ b64, AREAS }) => {
      const im = new Image(); im.src = 'data:image/jpeg;base64,' + b64; await im.decode();
      const c = document.getElementById('c');
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0);
      const sx = im.naturalWidth / 1280, sy = im.naturalHeight / 720;
      const out = {};
      // 全屏亮度也要
      const full = ctx.getImageData(0, 0, im.naturalWidth, im.naturalHeight).data;
      let fs = 0, fn = 0;
      for (let i = 0; i < full.length; i += 4) { fs += (full[i] * 77 + full[i + 1] * 151 + full[i + 2] * 28) >> 8; fn++; }
      out.__full = { luma: Math.round(fs / fn) };
      for (const [k, a] of Object.entries(AREAS)) {
        const lx = Math.round(a[0] * sx), ly = Math.round(a[1] * sy);
        const lw = Math.round((a[2] - a[0]) * sx), lh = Math.round((a[3] - a[1]) * sy);
        const d = ctx.getImageData(lx, ly, lw, lh).data;
        let s = 0, n = 0, s2 = 0;
        for (let i = 0; i < d.length; i += 4) {
          const l = (d[i] * 77 + d[i + 1] * 151 + d[i + 2] * 28) >> 8;
          s += l; s2 += l * l; n++;
        }
        const mean = s / n;
        out[k] = { luma: Math.round(mean), std: Math.round(Math.sqrt(Math.max(0, s2 / n - mean * mean))) };
      }
      return out;
    }, { b64, AREAS });
  };

  const m = await measure(maskImg);    // 有遮罩
  const p = await measure(plainImg);   // 无遮罩

  console.log('区域'.padEnd(12), '无遮罩', '  有遮罩', '  差值', '  比值  建议阈值(中点×1.4?)');
  for (const k of ['__full', ...Object.keys(AREAS)]) {
    const a = p[k].luma, b = m[k].luma;
    const diff = a - b;
    const ratio = a > 0 ? (b / a) : 0;
    console.log(
      k.padEnd(12),
      String(a).padStart(6), String(b).padStart(8), String(diff).padStart(6),
      '  ' + ratio.toFixed(2).padStart(5),
      '  ' + Math.round((a + b) / 2)
    );
  }
  console.log('\n(std 无/有):');
  for (const k of Object.keys(AREAS)) {
    console.log('  ' + k.padEnd(12), p[k].std, '/', m[k].std);
  }
  await page.close(); await browser.close();
})();
