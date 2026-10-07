// 精确量「右上角红叉」的颜色：在用户截图(1920x1080→1280x720)里扫 [1185,2,1272,70]
// 输出：红叉像素的 RGB 分布 + 最饱和色 + 与现有 closeX 色 {102,56,34} 的距离
const fs = require('fs');
const { chromium } = require('playwright');

const IMG = 'C:\\Users\\chenyu\\dsh\\火影忍者\\abundance-done.png';
const AREA = [1185, 2, 1272, 70];

(async () => {
  const url = 'data:image/png;base64,' + fs.readFileSync(IMG).toString('base64');
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = await b.newPage();
  const out = await p.evaluate(async ({ url, AREA }) => {
    const img = await new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = url; });
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, 1280, 720);
    const [X1, Y1, X2, Y2] = AREA, W = X2 - X1, H = Y2 - Y1;
    const d = g.getImageData(X1, Y1, W, H).data;

    const reds = [];
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const R = d[i], G = d[i + 1], B = d[i + 2];
      n++;
      // 红叉判据候选：亮红/橙红
      if (R > 120 && R > G + 45 && R > B + 45) reds.push([R, G, B]);
    }
    if (!reds.length) return { n, redN: 0 };
    // 求红叉像素的均值 + 各通道分位
    const ch = (k) => reds.map(v => v[k]).sort((a, b2) => a - b2);
    const q = (arr, t) => arr[Math.floor(arr.length * t)];
    const mean = [0, 1, 2].map(k => Math.round(reds.reduce((s, v) => s + v[k], 0) / reds.length));
    // 找最饱和（R-G 最大）的 5% 像素
    const sorted = [...reds].sort((a, b2) => (b2[0] - b2[1]) - (a[0] - a[1]));
    const top5 = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.05)));
    const topMean = [0, 1, 2].map(k => Math.round(top5.reduce((s, v) => s + v[k], 0) / top5.length));
    return {
      n, redN: reds.length, redPct: +(reds.length / n).toFixed(4),
      mean, top5Mean: topMean,
      q: { r: [q(ch(0), 0.1), q(ch(0), 0.5), q(ch(0), 0.9)], g: [q(ch(1), 0.1), q(ch(1), 0.5), q(ch(1), 0.9)], b: [q(ch(2), 0.1), q(ch(2), 0.5), q(ch(2), 0.9)] },
    };
  }, { url, AREA });

  console.log('区域', JSON.stringify(AREA));
  console.log('总像素', out.n, ' 红叉像素', out.redN, ' redPct', out.redPct);
  console.log('红叉像素均值', JSON.stringify(out.mean));
  console.log('最饱和 5% 均值', JSON.stringify(out.top5Mean));
  console.log('通道分位 p10/p50/p90: R', JSON.stringify(out.q.r), ' G', JSON.stringify(out.q.g), ' B', JSON.stringify(out.q.b));
  console.log('\n现有 closeX 色 = {102,56,34}，与红叉像素均值距离 =',
    Math.abs(102 - out.mean[0]) + Math.abs(56 - out.mean[1]) + Math.abs(34 - out.mean[2]));
  await p.close(); await b.close();
})();
