// 从准备界面帧 a001.jpg 切出「规则说明」左侧蓝色感叹号图标模板
// 感叹号实测框 (1085,108)-(1120,149) → 取核心 [1090,112,26,32]
// 关键：帧本身已是 1280x720（与运行时搜索同空间），无需缩放
const fs = require('fs');
const { chromium } = require('playwright');

const SRC = process.argv[2] || 'arena-tail-frames/a001.jpg';
const OUT = process.argv[3] || 'arena-ready-icon-tmpl.png';
const BOX = [1090, 112, 26, 32];   // [x,y,w,h]

(async () => {
  const url = 'data:image/jpeg;base64,' + fs.readFileSync(SRC).toString('base64');
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = await b.newPage();
  const out = await p.evaluate(async ({ url, BOX }) => {
    const img = new Image();
    await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = url; });
    const [x, y, w, h] = BOX;
    // 帧已是 1280x720，直接裁 —— 与运行时 findTemplate 同空间（避免插值糊模板）
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);
    return c.toDataURL('image/png');
  }, { url, BOX });
  fs.writeFileSync(OUT, Buffer.from(out.replace(/^data:image\/png;base64,/, ''), 'base64'));
  console.log(`已保存 ${OUT} (${fs.statSync(OUT).size} bytes)  裁自 ${SRC} [${BOX}] → ${BOX[2]}x${BOX[3]}`);
  await p.close(); await b.close();
})();
