// 在**光圈所在的窄横带**里找红/蓝环的水平重心（前面失败是因为扫了整个 320px 高的大带，全是背景噪声）
// 红环参考框（vision 实测）：(643,496)-(881,568)；环是椭圆，主要落在 y≈500..560
// 我方蓝环与红环同一水平带，只是 x 不同
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const BAND = [0, 480, 1280, 580];   // [x1,y1,x2,y2] 只取光圈所在的窄带

(async () => {
  const dir = process.argv[2];
  const files = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png)$/i.test(f)).sort();
  const data = files.map(f => ({ name: f, url: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64') }));

  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = await b.newPage();
  const res = await p.evaluate(async ({ data, BAND }) => {
    const load = s => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = s; });
    const [X1, Y1, X2, Y2] = BAND, W = X2 - X1, H = Y2 - Y1;
    const out = [];
    for (const it of data) {
      let img; try { img = await load(it.url); } catch (e) { continue; }
      const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, 1280, 720);
      const d = g.getImageData(X1, Y1, W, H).data;
      let rN = 0, bN = 0, rx = 0, bx = 0;
      let rMin = 9999, rMax = -1, bMin = 9999, bMax = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const R = d[i], G = d[i + 1], B = d[i + 2];
        // 红环：亮红/粉红（R 高且压过 G/B）
        if (R > 140 && R > G + 50 && R > B + 40) {
          rN++; rx += x; if (x < rMin) rMin = x; if (x > rMax) rMax = x;
        }
        // 蓝环：亮青蓝（B 高且压过 R）
        if (B > 140 && B > R + 50 && B > G + 20) {
          bN++; bx += x; if (x < bMin) bMin = x; if (x > bMax) bMax = x;
        }
      }
      out.push({
        name: it.name, rN, bN,
        rX: rN ? Math.round(rx / rN) : null, bX: bN ? Math.round(bx / bN) : null,
        rSpan: rN ? [rMin, rMax] : null, bSpan: bN ? [bMin, bMax] : null,
      });
    }
    return out;
  }, { data, BAND });

  const THR = 300;
  console.log('帧                    红n   红心  红跨度        蓝n   蓝心  蓝跨度        判定');
  for (const x of res) {
    let v;
    if (x.rN > THR && x.bN > THR) v = x.rX < x.bX ? '敌在【左】' : '敌在【右】';
    else v = `不足(红${x.rN}/蓝${x.bN})`;
    console.log(`${x.name.padEnd(22)} ${String(x.rN).padStart(5)} ${String(x.rX ?? '-').padStart(5)} ${JSON.stringify(x.rSpan ?? '-').padEnd(13)} ${String(x.bN).padStart(5)} ${String(x.bX ?? '-').padStart(5)} ${JSON.stringify(x.bSpan ?? '-').padEnd(13)} ${v}`);
  }
  const ok = res.filter(x => x.rN > THR && x.bN > THR);
  console.log(`\n可用 ${ok.length}/${res.length}`);
  if (ok.length) {
    const L = ok.filter(x => x.rX < x.bX).length;
    console.log(`敌在左 ${L} / 敌在右 ${ok.length - L}`);
    const sep = ok.map(x => Math.abs(x.rX - x.bX)).sort((a, b2) => a - b2);
    console.log(`红蓝中心水平间距: 最小 ${sep[0]} 中位 ${sep[Math.floor(sep.length/2)]} 最大 ${sep[sep.length-1]}`);
  }
  await p.close(); await b.close();
})();
