// 从 1920x1080 结算截图，**按 1280x720 逻辑空间**裁出图标模板（与搜索同空间 → 自匹配≈0）
const fs = require('fs');
const { chromium } = require('playwright');

const SRC = process.argv[2];
const OUT = process.argv[3];
// 图标在 1920 上 (1669,18)-(1725,70) → 1280 基准 = ÷1.5 = (1112.7,12)-(1150,46.7)
// 取整并各留 1px： (1112,11)-(1151,48)  → 39x37
const C1280 = [1112, 11, 1151, 48];

(async () => {
  const shot = 'data:image/png;base64,' + fs.readFileSync(SRC).toString('base64');
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = await b.newPage();
  const outB64 = await p.evaluate(async ({ shot, C1280 }) => {
    const img = new Image();
    await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = shot; });
    // 先归一到 1280x720，再从归一图上裁 —— 保证模板与运行时搜索同空间
    const full = document.createElement('canvas');
    full.width = 1280; full.height = 720;
    full.getContext('2d').drawImage(img, 0, 0, 1280, 720);
    const [x1, y1, x2, y2] = C1280;
    const w = x2 - x1, h = y2 - y1;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(full, x1, y1, w, h, 0, 0, w, h);
    return c.toDataURL('image/png');
  }, { shot, C1280 });
  fs.writeFileSync(OUT, Buffer.from(outB64.replace(/^data:image\/png;base64,/, ''), 'base64'));
  console.log(`已保存 ${OUT} (${fs.statSync(OUT).size} bytes)  裁自 1280x720 空间 [${C1280}] → ${C1280[2]-C1280[0]}x${C1280[3]-C1280[1]}`);
  await p.close(); await b.close();
})();
