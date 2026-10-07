// 准备界面「规则说明」蓝色感叹号 —— 模板匹配两态校准
// 模板: arena-ready-icon-tmpl.png (26x32, 从 a001.jpg 的 [1090,112,26,32] 裁出)
// 正样本: a001.jpg（vision 确认的准备界面）
// 负样本: 其余 70 帧（战斗中 / 结算 / 黑屏 / 蓝过场）
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const REGION = [1075, 100, 1135, 160];   // 搜索区 [x1,y1,x2,y2]，给感叹号留余量
const TMPL = 'arena-ready-icon-tmpl.png';

(async () => {
  const tmpl = 'data:image/png;base64,' + fs.readFileSync(TMPL).toString('base64');
  const dir = process.argv[2];
  const files = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png)$/i.test(f)).sort();
  const data = files.map(f => ({ name: f, url: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64') }));

  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = await b.newPage();
  const res = await p.evaluate(async ({ tmpl, data, REGION }) => {
    const load = s => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = s; });

    const ti = await load(tmpl);
    const tw = ti.width, th = ti.height;
    const tc = document.createElement('canvas'); tc.width = tw; tc.height = th;
    const tg = tc.getContext('2d'); tg.drawImage(ti, 0, 0);
    const td = tg.getImageData(0, 0, tw, th).data;
    const tz = new Float32Array(tw * th);
    let tm = 0;
    for (let i = 0, k = 0; i < td.length; i += 4, k++) { const v = .299*td[i] + .587*td[i+1] + .114*td[i+2]; tz[k] = v; tm += v; }
    tm /= tz.length;
    for (let k = 0; k < tz.length; k++) tz[k] -= tm;

    const [x1, y1, x2, y2] = REGION;
    const out = [];
    for (const it of data) {
      let img; try { img = await load(it.url); } catch (e) { continue; }
      const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, 1280, 720);
      const sw = x2 - x1, sh = y2 - y1;
      const sd = g.getImageData(x1, y1, sw, sh).data;
      const sz = new Float32Array(sw * sh);
      for (let i = 0, k = 0; i < sd.length; i += 4, k++) sz[k] = .299*sd[i] + .587*sd[i+1] + .114*sd[i+2];
      let best = Infinity, bx = -1, by = -1;
      for (let oy = 0; oy <= sh - th; oy++) for (let ox = 0; ox <= sw - tw; ox++) {
        let sum = 0, sm = 0;
        for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) sm += sz[(oy+y)*sw + (ox+x)];
        sm /= tw * th;
        for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++)
          sum += Math.abs((sz[(oy+y)*sw + (ox+x)] - sm) - tz[y*tw + x]);
        const sc = sum / (tw*th);
        if (sc < best) { best = sc; bx = x1+ox; by = y1+oy; }
      }
      out.push({ name: it.name, score: +best.toFixed(2), at: [bx, by] });
    }
    return out;
  }, { tmpl, data, REGION });

  const pos = res.find(r => r.name === 'a001.jpg');
  const neg = res.filter(r => r.name !== 'a001.jpg').sort((a, b2) => a.score - b2.score);
  console.log(`模板 ${TMPL}  (${'26x32'})   搜索区 [${REGION}]   共 ${res.length} 帧\n`);
  console.log(`【正样本】 ${pos.name}  score=${pos.score}  @(${pos.at})`);
  console.log(`\n【负样本】最小的 8 个：`);
  neg.slice(0, 8).forEach(r => console.log(`   ${String(r.score).padStart(7)}  ${r.name}  @(${r.at})`));
  const negMin = Math.min(...neg.map(r => r.score));
  const negMax = Math.max(...neg.map(r => r.score));
  console.log(`\n负样本 score 范围: ${negMin} ~ ${negMax}`);
  console.log(`\n分离度: 正=${pos.score}  |  负最近=${negMin}`);
  if (negMin > pos.score) {
    console.log(`✅ 完全可分，间隙 ${(negMin - pos.score).toFixed(2)}`);
    console.log(`   建议阈值 = ${((pos.score + negMin)/2).toFixed(1)}`);
    console.log(`   两侧余量: 距正 ${(negMin/2).toFixed(1)} / 距负 ${(negMin/2).toFixed(1)}`);
  } else {
    console.log(`❌ 不可分`);
  }
  await p.close(); await b.close();
})();
