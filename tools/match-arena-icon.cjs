// 用模板匹配在 trace 帧上找「战斗详情」蓝色卷轴图标，看分离度
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DIR = process.argv[2] || 'trace-frames-arena';
const SRC_SHOT = process.argv[3];   // 1920x1080 结算截图

// 结算截图上的图标 (1920x1080)：ground 得到裁剪内 (29,8)-(85,60)，裁剪偏移 (1640,10)
//   → 原图 (1669,18)-(1725,70)，收紧 2px 去掉黄字： (1669,18)-(1724,69)
const ICON_1920 = [1669, 18, 1724, 69];

(async () => {
  const files = fs.readdirSync(DIR).filter(f => /^f\d+\.(jpg|png)$/.test(f)).sort();
  const imgs = files.map(f => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(DIR, f)).toString('base64'));
  const shot = 'data:image/png;base64,' + fs.readFileSync(SRC_SHOT).toString('base64');

  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = await b.newPage();
  const res = await p.evaluate(async ({ imgs, shot, ICON_1920, files }) => {
    // 1) 从结算截图裁出模板（缩放到 1280x720 基准）
    const load = (src) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = src; });
    const shotImg = await load(shot);
    const tsc = document.createElement('canvas');
    tsc.width = 1280; tsc.height = 720;
    const tg = tsc.getContext('2d');
    tg.drawImage(shotImg, 0, 0, 1280, 720);
    // 模板坐标（1280 基准）
    const tx1 = Math.round(ICON_1920[0] / 1.5), ty1 = Math.round(ICON_1920[1] / 1.5);
    const tw = Math.round((ICON_1920[2] - ICON_1920[0]) / 1.5), th = Math.round((ICON_1920[3] - ICON_1920[1]) / 1.5);
    const tmplData = tg.getImageData(tx1, ty1, tw, th).data;
    const tmplGray = new Float32Array(tw * th);
    for (let i = 0, k = 0; i < tmplData.length; i += 4, k++) {
      tmplGray[k] = 0.299 * tmplData[i] + 0.587 * tmplData[i + 1] + 0.114 * tmplData[i + 2];
    }
    // 模板去均值（提高光照鲁棒性）
    let tmean = 0; for (const v of tmplGray) tmean += v; tmean /= tmplGray.length;
    const tmplZ = Float32Array.from(tmplGray, v => v - tmean);

    // 2) 在每帧的搜索区域内做 SAD 匹配
    const SR = [tx1 - 14, ty1 - 10, tx1 + tw + 14, ty1 + th + 10];   // 搜索区（1280 基准）
    const out = [];
    for (let fi = 0; fi < imgs.length; fi++) {
      const img = await load(imgs[fi]);
      const c = document.createElement('canvas');
      c.width = 1280; c.height = 720;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, 1280, 720);
      const sd = g.getImageData(SR[0], SR[1], SR[2] - SR[0], SR[3] - SR[1]).data;
      const sw = SR[2] - SR[0], sh = SR[3] - SR[1];
      const sGray = new Float32Array(sw * sh);
      for (let i = 0, k = 0; i < sd.length; i += 4, k++) {
        sGray[k] = 0.299 * sd[i] + 0.587 * sd[i + 1] + 0.114 * sd[i + 2];
      }
      let best = Infinity;
      for (let oy = 0; oy <= sh - th; oy++) {
        for (let ox = 0; ox <= sw - tw; ox++) {
          let sum = 0, ssum = 0;
          for (let y = 0; y < th; y++) {
            for (let x = 0; x < tw; x++) ssum += sGray[(oy + y) * sw + (ox + x)];
          }
          const smean = ssum / (tw * th);
          for (let y = 0; y < th; y++) {
            for (let x = 0; x < tw; x++) {
              sum += Math.abs((sGray[(oy + y) * sw + (ox + x)] - smean) - tmplZ[y * tw + x]);
            }
          }
          const sc = sum / (tw * th);
          if (sc < best) best = sc;
        }
      }
      out.push({ name: files[fi], score: +best.toFixed(2) });
    }
    return out;
  }, { imgs, shot, ICON_1920, files });

  const sorted = [...res].sort((a, b2) => a.score - b2.score);
  console.log('=== 最像图标的 20 帧（score 越小越像）===');
  sorted.slice(0, 20).forEach(r => console.log(`  ${r.name}  score=${r.score}`));
  console.log('\n=== 最不像的 8 帧 ===');
  sorted.slice(-8).forEach(r => console.log(`  ${r.name}  score=${r.score}`));

  const scores = res.map(r => r.score);
  console.log(`\nmin=${Math.min(...scores)}  max=${Math.max(...scores)}`);

  await p.close();
  await b.close();
})();
