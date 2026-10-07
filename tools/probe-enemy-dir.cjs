// 可行性探针：用「我方蓝色光圈 / 敌方红色光圈」的水平重心判敌人方向
// 只扫人物所在的中间横向带 y=200..520（避开顶部 HUD 与底部按键区）
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const BAND = [0, 200, 1280, 520];   // [x1,y1,x2,y2]

(async () => {
  const dir = process.argv[2];
  const files = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png)$/i.test(f)).sort();
  const data = files.map(f => ({ name: f, url: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64') }));

  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = await b.newPage();
  const res = await p.evaluate(async ({ data, BAND }) => {
    const load = s => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = s; });
    const [X1, Y1, X2, Y2] = BAND;
    const W = X2 - X1, H = Y2 - Y1;
    const out = [];
    for (const it of data) {
      let img; try { img = await load(it.url); } catch (e) { continue; }
      const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, 1280, 720);
      const d = g.getImageData(X1, Y1, W, H).data;
      let redN = 0, blueN = 0, rx = 0, bx = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          const R = d[i], G = d[i + 1], B = d[i + 2];
          if (R > 120 && R > G + 45 && R > B + 45) { redN++; rx += x; }
          if (B > 120 && B > R + 45 && B > G + 30) { blueN++; bx += x; }
        }
      }
      out.push({
        name: it.name, redN, blueN,
        redX: redN ? Math.round(rx / redN) : null,
        blueX: blueN ? Math.round(bx / blueN) : null,
      });
    }
    return out;
  }, { data, BAND });

  const THR = 800;
  console.log('帧        红像素   红重心X   蓝像素   蓝重心X   判定');
  for (const x of res) {
    let v = '—';
    if (x.redN > THR && x.blueN > THR) v = x.redX < x.blueX ? '敌在【左】' : '敌在【右】';
    else v = `像素不足(红${x.redN}/蓝${x.blueN})`;
    console.log(`${x.name}  ${String(x.redN).padStart(7)}  ${String(x.redX ?? '-').padStart(7)}  ${String(x.blueN).padStart(7)}  ${String(x.blueX ?? '-').padStart(7)}   ${v}`);
  }
  const valid = res.filter(x => x.redN > THR && x.blueN > THR);
  console.log(`\n可用帧 ${valid.length}/${res.length}`);
  if (valid.length) {
    const L = valid.filter(x => x.redX < x.blueX).length;
    console.log(`其中 敌在左 ${L} 帧 / 敌在右 ${valid.length - L} 帧`);
    const gaps = valid.map(x => Math.abs(x.redX - x.blueX));
    gaps.sort((a, b2) => a - b2);
    console.log(`红蓝重心水平间距: 最小 ${gaps[0]}  中位 ${gaps[Math.floor(gaps.length/2)]}  最大 ${gaps[gaps.length-1]}`);
  }
  await p.close(); await b.close();
})();
