// 从游戏页实时截取指定区域，存成 PNG，供人眼核对（券图标位置）
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages().find(x => /start\.qq\.com\/game/.test(x.url()));
  const outDir = path.resolve(__dirname, '..', 'trace-frames');
  fs.mkdirSync(outDir, { recursive: true });
  const r = await p.evaluate(() => {
    const A = window.__narutoAuto;
    A.vision.capture(true);
    return A.vision.canvas.toDataURL('image/png');
  });
  const b64 = r.split(',')[1];
  const f = path.join(outDir, 'live-full.png');
  fs.writeFileSync(f, Buffer.from(b64, 'base64'));
  console.log('已存全图 →', f);
  await b.close();
})();
