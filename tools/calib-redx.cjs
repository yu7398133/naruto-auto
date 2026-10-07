// 校准「右上角红✕」判据：正在战斗 vs 战斗结束
// 区域 = PROBES.backBtnX.area = [1040,0,1280,120]
// 对 trace 的 374 帧分别算：红色占比 + 与目标色 rgb(170,45,14) 的匹配度 + 像素方差
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const P = 'C:\\Users\\chenyu\\dsh\\火影忍者\\trace-abundance.html';
const AREA = [1040, 0, 1280, 120];
const TARGET = [170, 45, 14];

(async () => {
  const html = fs.readFileSync(P, 'utf8');
  const i = html.indexOf('var STEPS=');
  const k = html.indexOf('[', i);
  let depth = 0, instr = false, esc = false, end = -1;
  for (let j = k; j < html.length; j++) {
    const ch = html[j];
    if (instr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') instr = false; continue; }
    if (ch === '"') instr = true;
    else if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  const steps = JSON.parse(html.slice(k, end));
  const withF = steps.filter(s => s.frame);
  console.log('总步数', steps.length, '带帧', withF.length);

  const data = withF.map(s => ({ seq: s.seq, label: s.label || '', scene: s.scene, url: s.frame }));

  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = await b.newPage();
  const res = await p.evaluate(async ({ data, AREA, TARGET }) => {
    const load = s => new Promise((r, j) => { const i2 = new Image(); i2.onload = () => r(i2); i2.onerror = j; i2.src = s; });
    const [X1, Y1, X2, Y2] = AREA, W = X2 - X1, H = Y2 - Y1;
    const [TR, TG, TB] = TARGET;
    const out = [];
    for (const it of data) {
      let img; try { img = await load(it.url); } catch (e) { continue; }
      const c = document.createElement('canvas');
      // 帧是 1920x1080，归一化到 1280x720 再取区域
      c.width = 1280; c.height = 720;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, 1280, 720);
      const d = g.getImageData(X1, Y1, W, H).data;
      let n = 0, hit = 0, sr = 0, sg = 0, sb = 0, s2 = 0, redish = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i3 = (y * W + x) * 4, R = d[i3], G = d[i3 + 1], B = d[i3 + 2];
        n++; sr += R; sg += G; sb += B;
        const lum = 0.3 * R + 0.59 * G + 0.11 * B; s2 += lum * lum;
        const dist = Math.abs(R - TR) + Math.abs(G - TG) + Math.abs(B - TB);
        if (dist <= 135) hit++;              // tol=45 时逐通道 |d|<=45 → 和<=135
        if (R > 120 && R > G + 45 && R > B + 45) redish++;
      }
      const mr = sr / n, mg = sg / n, mb = sb / n;
      const ml = 0.3 * mr + 0.59 * mg + 0.11 * mb;
      const std = Math.sqrt(Math.max(0, s2 / n - ml * ml));
      out.push({ seq: it.seq, label: it.label, scene: it.scene,
        mean: [Math.round(mr), Math.round(mg), Math.round(mb)],
        redPct: +(redish / n).toFixed(4), hitPct: +(hit / n).toFixed(4), std: +std.toFixed(2) });
    }
    return out;
  }, { data, AREA, TARGET });

  // 按 hitPct 排序，看有无间隙
  const sorted = [...res].sort((a, b2) => b2.hitPct - a.hitPct);
  console.log('\n按「与目标色匹配占比 hitPct」降序，前 20：');
  console.log('seq    hitPct  redPct  std    mean              scene   label');
  for (const x of sorted.slice(0, 20))
    console.log(`${String(x.seq).padStart(4)}  ${String(x.hitPct).padStart(6)}  ${String(x.redPct).padStart(5)}  ${String(x.std).padStart(5)}  ${JSON.stringify(x.mean).padEnd(16)} ${String(x.scene).padEnd(7)} ${x.label}`);
  console.log('\n末 10 步（战斗卡住段，seq>=365）：');
  for (const x of res.filter(r => r.seq >= 365))
    console.log(`${String(x.seq).padStart(4)}  ${String(x.hitPct).padStart(6)}  ${String(x.redPct).padStart(5)}  ${String(x.std).padStart(5)}  ${JSON.stringify(x.mean).padEnd(16)} ${String(x.scene).padEnd(7)} ${x.label}`);

  const vals = res.map(x => x.hitPct).sort((a, b2) => a - b2);
  console.log('\nhitPct 分位: p50=%s p90=%s p99=%s max=%s',
    vals[Math.floor(vals.length * 0.5)], vals[Math.floor(vals.length * 0.9)], vals[Math.floor(vals.length * 0.99)], vals[vals.length - 1]);
  await p.close(); await b.close();
})();
