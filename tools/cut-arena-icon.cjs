// 从 1920x1080 结算截图裁出「战斗详情」蓝色卷轴图标，输出 base64 模板
// 图标在 1920x1080 上坐标 (1669,18)-(1725,70)，收窄到图标本体 (1670,20)-(1723,68)
const fs = require('fs');
const { chromium } = require('playwright');

const SRC = process.argv[2];  // 结算截图路径
const OUT = process.argv[3] || 'arena-end-icon-tmpl.png';

const COORDS_1920 = [1669, 18, 1725, 70];

(async () => {
  const shot = 'data:image/png;base64,' + fs.readFileSync(SRC).toString('base64');
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = await b.newPage();
  const iconBase64 = await p.evaluate(async ({ shot, COORDS_1920 }) => {
    const img = new Image();
    await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = shot; });
    const [x1, y1, x2, y2] = COORDS_1920;
    const w = x2 - x1, h = y2 - y1;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(img, x1, y1, w, h, 0, 0, w, h);
    return c.toDataURL('image/png');
  }, { shot, COORDS_1920 });
  const data = iconBase64.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(OUT, Buffer.from(data, 'base64'));
  console.log(`已保存 ${OUT} (${fs.statSync(OUT).size} bytes)`);
  await p.close(); await b.close();
})();