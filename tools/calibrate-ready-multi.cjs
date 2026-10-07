// 多条件准备界面判据（用户口径：感叹号模板 + 右上角红X）
// 组件① 感叹号模板匹配 —— 已校准：正 0 / 负 ≥22.98
// 组件② 右上角红X —— 区域 (1190,10)-(1261,71)，用已有 closeRed 的红色指纹
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const TMPL = 'arena-ready-icon-tmpl.png';
const ICON_REGION = [1075, 100, 1135, 160];
const X_REGION = [1190, 10, 1261, 71];    // [x1,y1,x2,y2]

(async () => {
  const tmpl = 'data:image/png;base64,' + fs.readFileSync(TMPL).toString('base64');
  const dir = process.argv[2];
  const files = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png)$/i.test(f)).sort();
  const data = files.map(f => ({ name: f, url: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64') }));

  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = await b.newPage();
  const res = await p.evaluate(async ({ tmpl, data, ICON_REGION, X_REGION }) => {
    const load = s => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = s; });
    const ti = await load(tmpl);
    const tw = ti.width, th = ti.height;
    const tc = document.createElement('canvas'); tc.width = tw; tc.height = th;
    const tg = tc.getContext('2d'); tg.drawImage(ti, 0, 0);
    const td = tg.getImageData(0, 0, tw, th).data;
    const tz = new Float32Array(tw * th); let tm = 0;
    for (let i = 0, k = 0; i < td.length; i += 4, k++) { const v = .299*td[i]+.587*td[i+1]+.114*td[i+2]; tz[k]=v; tm+=v; }
    tm /= tz.length; for (let k = 0; k < tz.length; k++) tz[k] -= tm;

    const [x1, y1, x2, y2] = ICON_REGION;
    const out = [];
    for (const it of data) {
      let img; try { img = await load(it.url); } catch (e) { continue; }
      const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, 1280, 720);

      // ① 感叹号模板
      const sw = x2 - x1, sh = y2 - y1;
      const sd = g.getImageData(x1, y1, sw, sh).data;
      const sz = new Float32Array(sw * sh);
      for (let i = 0, k = 0; i < sd.length; i += 4, k++) sz[k] = .299*sd[i]+.587*sd[i+1]+.114*sd[i+2];
      let best = Infinity;
      for (let oy = 0; oy <= sh - th; oy++) for (let ox = 0; ox <= sw - tw; ox++) {
        let sum = 0, sm = 0;
        for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) sm += sz[(oy+y)*sw+(ox+x)];
        sm /= tw*th;
        for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) sum += Math.abs((sz[(oy+y)*sw+(ox+x)]-sm) - tz[y*tw+x]);
        const sc = sum/(tw*th); if (sc < best) best = sc;
      }

      // ② 红X 区域红色占比
      const [a1, b1, a2, b2] = X_REGION;
      const xd = g.getImageData(a1, b1, a2 - a1, b2 - b1).data;
      let n = 0, red = 0;
      for (let i = 0; i < xd.length; i += 4) {
        n++;
        const R = xd[i], G = xd[i+1], B = xd[i+2];
        if (R > 130 && R > G + 60 && R > B + 60) red++;
      }
      out.push({ name: it.name, icon: +best.toFixed(2), redPct: +(red/n).toFixed(4) });
    }
    return out;
  }, { tmpl, data, ICON_REGION, X_REGION });

  const pos = res.find(r => r.name === 'a001.jpg');
  const neg = res.filter(r => r.name !== 'a001.jpg');
  console.log(`正样本 a001:  icon=${pos.icon}   redX=${pos.redPct}`);
  const negIcon = neg.map(r => r.icon), negRed = neg.map(r => r.redPct);
  console.log(`负样本 ${neg.length} 张: icon ${Math.min(...negIcon)}~${Math.max(...negIcon)} | redX ${Math.min(...negRed)}~${Math.max(...negRed)}`);

  // AND 组合
  const ICON_T = 11.5, RED_T = (pos.redPct + Math.max(...negRed)) / 2;
  console.log(`\n阈值: icon<${ICON_T}  AND  redX>=${RED_T.toFixed(4)}`);
  const falseHit = neg.filter(r => r.icon < ICON_T && r.redPct >= RED_T);
  console.log(`负样本误命中: ${falseHit.length}`);
  falseHit.slice(0, 5).forEach(r => console.log(`   ${r.name} icon=${r.icon} redX=${r.redPct}`));
  console.log(`正样本命中: ${(pos.icon < ICON_T && pos.redPct >= RED_T) ? '✅' : '❌'}`);
  console.log(`\n→ AND 组合 ${falseHit.length === 0 && pos.icon < ICON_T && pos.redPct >= RED_T ? '✅ 完美可分' : '⚠ 需复核'}`);
  await p.close(); await b.close();
})();
