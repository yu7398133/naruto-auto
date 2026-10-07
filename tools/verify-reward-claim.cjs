// 验证 sawArenaRewardClaimed 判据（红 vs 金）在真实样本上的表现。
// 用法：node tools/verify-reward-claim.cjs
const { chromium } = require('playwright');
const fs = require('fs');

// 与脚本一致的常量
const AREAS = [[1081, 153, 1184, 233], [1079, 287, 1179, 351]];
const RED_MIN_PCT = 8;
const isRed = (R, G, B) => R > 120 && (R - G) > 40 && (G - B) < 25;

const CASES = [
  { f: '.dsh-vision-router/artifacts/.runs/.vision-run-handoff/materialized/21f96e1dff914214f36e.png', want: [true, true], desc: '全部领完（应两个都红）' },
  { f: '.dsh-vision-router/artifacts/.runs/.vision-run-handoff/materialized/df9c32c2e1d733f6bcf2.png', want: [false, false], desc: '第4把刚完成（第1空、第2金按钮）' },
  { f: 'tools/reward-frames/a-s2-2.2s.jpg', want: [false, false], desc: '录制 seq2 可领取态' },
  { f: 'tools/reward-frames/a-s5-7.5s.jpg', want: [false, false], desc: '录制 seq5 未完成态' },
];

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = await browser.contexts()[0].newPage();
  await page.setContent('<canvas id=c></canvas>');

  let pass = 0;
  for (const c of CASES) {
    if (!fs.existsSync(c.f)) { console.log('skip(missing)', c.f); continue; }
    const mime = /\.png$/i.test(c.f) ? 'image/png' : 'image/jpeg';
    const b64 = fs.readFileSync(c.f).toString('base64');
    const got = await page.evaluate(async ({ b64, mime, AREAS, RED_MIN_PCT }) => {
      const im = new Image(); im.src = `data:${mime};base64,` + b64; await im.decode();
      const cv = document.getElementById('c');
      cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      const ctx = cv.getContext('2d'); ctx.drawImage(im, 0, 0);
      const sx = im.naturalWidth / 1280, sy = im.naturalHeight / 720;
      const out = [];
      for (const a of AREAS) {
        const lx = Math.round(a[0] * sx), ly = Math.round(a[1] * sy);
        const lw = Math.round((a[2] - a[0]) * sx), lh = Math.round((a[3] - a[1]) * sy);
        const d = ctx.getImageData(lx, ly, lw, lh).data;
        let n = 0, red = 0;
        for (let i = 0; i < d.length; i += 4) {
          n++;
          if ((d[i] > 120) && (d[i] - d[i + 1] > 40) && (d[i + 1] - d[i + 2] < 25)) red++;
        }
        out.push(+(red / n * 100).toFixed(1));
      }
      return out;
    }, { b64, mime, AREAS, RED_MIN_PCT });

    const oks = got.map(p => p >= RED_MIN_PCT);
    const good = oks[0] === c.want[0] && oks[1] === c.want[1];
    if (good) pass++;
    console.log(
      (good ? '✅' : '❌') + ' ' + c.desc.padEnd(26),
      '红%=' + JSON.stringify(got).padEnd(16),
      '判定=' + JSON.stringify(oks).padEnd(16),
      '期望=' + JSON.stringify(c.want)
    );
  }
  console.log(`\n结果: ${pass}/${CASES.length} 通过`);
  await page.close(); await browser.close();
})();
