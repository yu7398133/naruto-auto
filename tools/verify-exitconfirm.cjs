// 验证 detectExitConfirm 的最终判据（金色 AND 遮罩）在真实正负样本上的表现。
// 用法：node tools/verify-exitconfirm.cjs <有遮罩.png> <无遮罩.png> [其他负样本...]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// —— 与脚本内完全一致的常量 ——
const EXIT_REGION = [542, 421, 731, 477];
const EXIT_COLOR = { r: 214, g: 183, b: 111 };
const GOLD_MIN = 0.5, DIST_MAX = 120;
const DIM_AREAS = [
  [30, 60, 240, 190], [1040, 60, 1250, 190], [30, 540, 240, 690],
  [30, 300, 170, 440], [1110, 300, 1250, 440],
];
const DIM_LUMA_MAX = 40, DIM_NEED = 4;

(async () => {
  const files = process.argv.slice(2);
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = await browser.contexts()[0].newPage();
  await page.setContent('<canvas id=c></canvas>');

  console.log('文件'.padEnd(30), '结局  金色%  色距  暗块  lumas');
  for (const fp of files) {
    const buf = fs.readFileSync(fp);
    const mime = /\.png$/i.test(fp) ? 'image/png' : 'image/jpeg';
    const r = await page.evaluate(async ({ b64, mime, EXIT_REGION, EXIT_COLOR, GOLD_MIN, DIST_MAX, DIM_AREAS, DIM_LUMA_MAX, DIM_NEED }) => {
      const im = new Image(); im.src = `data:${mime};base64,` + b64; await im.decode();
      const c = document.getElementById('c');
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0);
      const sx = im.naturalWidth / 1280, sy = im.naturalHeight / 720;
      // 金色
      const ex = EXIT_REGION.map((v, i) => Math.round(v * (i % 2 ? sy : sx)));
      const ed = ctx.getImageData(ex[0], ex[1], ex[2] - ex[0], ex[3] - ex[1]).data;
      let r0 = 0, g0 = 0, b0 = 0, n0 = 0, gold = 0;
      for (let i = 0; i < ed.length; i += 4) {
        r0 += ed[i]; g0 += ed[i + 1]; b0 += ed[i + 2]; n0++;
        if (ed[i] > 150 && ed[i + 1] > 120 && ed[i + 2] < 110) gold++;
      }
      const mean = [r0 / n0, g0 / n0, b0 / n0];
      const goldPct = gold / n0;
      const dist = Math.sqrt((mean[0] - EXIT_COLOR.r) ** 2 + (mean[1] - EXIT_COLOR.g) ** 2 + (mean[2] - EXIT_COLOR.b) ** 2);
      const goldOk = goldPct >= GOLD_MIN && dist <= DIST_MAX;
      // 遮罩
      const lumas = []; let dark = 0;
      for (const a of DIM_AREAS) {
        const ax = a.map((v, i) => Math.round(v * (i % 2 ? sy : sx)));
        const dd = ctx.getImageData(ax[0], ax[1], ax[2] - ax[0], ax[3] - ax[1]).data;
        let s = 0, n = 0;
        for (let i = 0; i < dd.length; i += 4) { s += (dd[i] * 77 + dd[i + 1] * 151 + dd[i + 2] * 28) >> 8; n++; }
        const lu = s / n; lumas.push(Math.round(lu));
        if (lu <= DIM_LUMA_MAX) dark++;
      }
      const dimOk = dark >= DIM_NEED;
      return { ok: goldOk && dimOk, goldPct: +goldPct.toFixed(3), dist: Math.round(dist), goldOk, dimOk, dark, lumas };
    }, { b64: buf.toString('base64'), mime, EXIT_REGION, EXIT_COLOR, GOLD_MIN, DIST_MAX, DIM_AREAS, DIM_LUMA_MAX, DIM_NEED });

    console.log(
      path.basename(fp).slice(0, 28).padEnd(30),
      (r.ok ? '✅命中' : '❌未中').padEnd(6),
      String(r.goldPct).padStart(6), String(r.dist).padStart(5),
      ` ${r.dark}/5`.padStart(6), ' [' + r.lumas.join(',') + ']',
      r.goldOk ? '' : ' (金色不满足)', r.dimOk ? '' : ' (遮罩不满足)'
    );
  }
  await page.close(); await browser.close();
})();
