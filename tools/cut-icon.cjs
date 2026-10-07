// 裁出「挑战券图标」模板（x 458..492, y 630..668），存成 dataURL 供脚本内嵌。
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages().find(x => /start\.qq\.com\/game/.test(x.url()));
  const r = await p.evaluate(() => {
    const A = window.__narutoAuto;
    A.vision.capture(true);
    // 连续抓 5 帧，确认稳定性（图标应几乎不变）
    const out = { shots: [] };
    for (let i = 0; i < 5; i++) {
      A.vision.capture(true);
      const g = A.vision.canvas.getContext('2d', { willReadFrequently: true });
      const cv = document.createElement('canvas');
      cv.width = 34; cv.height = 38;
      cv.getContext('2d').drawImage(A.vision.canvas, 458, 630, 34, 38, 0, 0, 34, 38);
      out.shots.push(cv.toDataURL('image/jpeg', 0.92));
      // 同时给均值，判断是否静止
      const d = g.getImageData(458, 630, 34, 38).data;
      let r2 = 0, g2 = 0, b2 = 0, n = 0;
      for (let j = 0; j < d.length; j += 4) { r2 += d[j]; g2 += d[j + 1]; b2 += d[j + 2]; n++; }
      out.shots[out.shots.length - 1] = {
        url: out.shots[out.shots.length - 1],
        mean: [Math.round(r2 / n), Math.round(g2 / n), Math.round(b2 / n)],
      };
    }
    return out;
  }).catch(e => ({ fatal: e.message }));
  if (r.fatal) { console.log(r.fatal); await b.close(); return; }
  console.log('连续 5 帧均值（判断图标是否静止）:');
  for (const s of r.shots) console.log('  (' + s.mean.join(',') + ')');
  const dir = path.resolve(__dirname, '..', 'trace-frames');
  const f = path.join(dir, 'icon-tmpl.jpg');
  fs.writeFileSync(f, Buffer.from(r.shots[0].url.split(',')[1], 'base64'));
  console.log('\n模板已存 →', f);
  console.log('dataURL 长度:', r.shots[0].url.length);
  fs.writeFileSync(path.join(dir, 'icon-tmpl.txt'), r.shots[0].url);
  await b.close();
})();
