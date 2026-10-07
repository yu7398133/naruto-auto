// 用 trace 帧（step2.jpg = 弹窗画面）实测 detectExitConfirm 的判据
// 复刻 detectExitConfirm 的算法，在 Node 里对图片像素跑一遍
const { chromium } = require('playwright');
const fs = require('fs');

const IMG = process.argv[2];
const REGION = [542, 421, 731, 477];       // SECRET_REALM_EXIT_CONFIRM_REGION
const REF = { r: 214, g: 183, b: 111 };    // SECRET_REALM_EXIT_CONFIRM_COLOR

(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = await b.newPage();
  const dataUrl = 'data:image/jpeg;base64,' + fs.readFileSync(IMG).toString('base64');
  const r = await p.evaluate(async ({ dataUrl, REGION, REF }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const out = { imgSize: [img.width, img.height] };

    // 图片若是 320x180 缩略图，需把 1280 基准坐标换算过来
    const sx = img.width / 1280, sy = img.height / 720;
    out.scale = [sx, sy];
    const [x1, y1, x2, y2] = REGION;
    const rx = Math.round(x1 * sx), ry = Math.round(y1 * sy);
    const rw = Math.max(1, Math.round((x2 - x1) * sx));
    const rh = Math.max(1, Math.round((y2 - y1) * sy));
    out.actualRegion = [rx, ry, rw, rh];

    const d = g.getImageData(rx, ry, rw, rh).data;
    let R = 0, G = 0, B = 0, n = 0, gold = 0;
    for (let i = 0; i < d.length; i += 4) {
      const rr = d[i], gg = d[i + 1], bb = d[i + 2];
      R += rr; G += gg; B += bb; n++;
      if (rr > 150 && gg > 120 && bb < 110) gold++;
    }
    const mean = [Math.round(R / n), Math.round(G / n), Math.round(B / n)];
    const goldPct = gold / n;
    const dist = Math.sqrt((mean[0] - REF.r) ** 2 + (mean[1] - REF.g) ** 2 + (mean[2] - REF.b) ** 2);
    out.mean = mean;
    out.goldPct = +goldPct.toFixed(3);
    out.dist = Math.round(dist);
    out.ok = goldPct >= 0.5 && dist <= 120;
    return out;
  }, { dataUrl, REGION, REF });

  console.log(JSON.stringify(r, null, 1));
  await p.close();
  await b.close();
})();
