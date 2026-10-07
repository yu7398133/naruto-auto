// 在全部 trace 帧上测「战斗详情图标」区域的特征，找出结算帧 vs 战斗帧的分界
// 图标位置(1920x1080)=(1669,18)-(1725,70) → 1280x720 = (1113,12)-(1150,47)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DIR = process.argv[2] || 'trace-frames-arena';
// 稍微外扩留边距，便于模板匹配
const REGION = [1105, 5, 1160, 55];   // 1280x720

(async () => {
  const files = fs.readdirSync(DIR).filter(f => /^f\d+\.(jpg|png)$/.test(f)).sort();
  const imgs = files.map(f => ({
    name: f,
    data: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(DIR, f)).toString('base64'),
  }));

  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = await b.newPage();
  const res = await p.evaluate(async ({ imgs, REGION }) => {
    const out = [];
    const [x1, y1, x2, y2] = REGION;
    for (const it of imgs) {
      const img = new Image();
      await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = it.data; });
      const sx = img.width / 1280, sy = img.height / 720;
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const rx = Math.round(x1 * sx), ry = Math.round(y1 * sy);
      const rw = Math.max(1, Math.round((x2 - x1) * sx)), rh = Math.max(1, Math.round((y2 - y1) * sy));
      const d = g.getImageData(rx, ry, rw, rh).data;
      let R = 0, G = 0, B = 0, n = 0, blue = 0, bright = 0;
      for (let i = 0; i < d.length; i += 4) {
        const rr = d[i], gg = d[i + 1], bb = d[i + 2];
        R += rr; G += gg; B += bb; n++;
        // 蓝色图标：B 明显大于 R，且整体偏亮
        if (bb > rr + 25 && bb > 90) blue++;
        if (rr + gg + bb > 330) bright++;
      }
      out.push({
        name: it.name,
        mean: [Math.round(R / n), Math.round(G / n), Math.round(B / n)],
        bluePct: +(blue / n).toFixed(3),
        brightPct: +(bright / n).toFixed(3),
      });
    }
    return out;
  }, { imgs, REGION });

  console.log('name      meanR meanG meanB   bluePct brightPct');
  for (const r of res) {
    console.log(`${r.name}  ${String(r.mean[0]).padStart(4)} ${String(r.mean[1]).padStart(5)} ${String(r.mean[2]).padStart(5)}   ${r.bluePct.toFixed(3)}   ${r.brightPct.toFixed(3)}`);
  }

  // 按 bluePct 排序，看分离度
  const sorted = [...res].sort((a, b2) => b2.bluePct - a.bluePct);
  console.log('\n=== bluePct Top 15 ===');
  sorted.slice(0, 15).forEach(r => console.log(`  ${r.name} blue=${r.bluePct} bright=${r.brightPct}`));
  console.log('=== bluePct Bottom 5 ===');
  sorted.slice(-5).forEach(r => console.log(`  ${r.name} blue=${r.bluePct} bright=${r.brightPct}`));

  await p.close();
  await b.close();
})();
