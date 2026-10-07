// 结算图标探针「正负样本」实测 —— 决定阈值（方法论 §2：阈值必须由正负样本实测值取中）
// 正样本 : arena-end-icon-tmpl.png 的来源截图（结算画面）
// 负样本 : tools/tickets/*.png（秘境相关画面，1920x1080）+ 其它本地截图
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const POS = process.argv[2];
const NEG_GLOB_DIRS = process.argv.slice(3);

// 与脚本内常量保持一致（1280x720 逻辑空间）
const REGION = [1100, 4, 1163, 58];
const TMPL_SRC = 'arena-end-icon-tmpl.png';   // 56x52 已切好

(async () => {
  const tmpl = 'data:image/png;base64,' + fs.readFileSync(TMPL_SRC).toString('base64');

  const negs = [];
  for (const d of NEG_GLOB_DIRS) {
    if (!fs.existsSync(d)) continue;
    const st = fs.statSync(d);
    const files = st.isDirectory()
      ? fs.readdirSync(d).filter(f => /\.(png|jpg|jpeg)$/i.test(f)).map(f => path.join(d, f))
      : [d];
    negs.push(...files);
  }
  const imgs = [POS, ...negs];
  const data = imgs.map(p => ({
    name: path.basename(p),
    url: 'data:image/' + (/\.png$/i.test(p) ? 'png' : 'jpeg') + ';base64,' + fs.readFileSync(p).toString('base64'),
  }));

  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = await b.newPage();
  const res = await p.evaluate(async ({ tmpl, data, REGION }) => {
    const load = (src) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = src; });

    // 模板转灰度 + 去均值
    const ti = await load(tmpl);
    const tc = document.createElement('canvas');
    tc.width = ti.width; tc.height = ti.height;
    const tg = tc.getContext('2d'); tg.drawImage(ti, 0, 0);
    const tw = ti.width, th = ti.height;
    const td = tg.getImageData(0, 0, tw, th).data;
    const tz = new Float32Array(tw * th);
    let tm = 0;
    for (let i = 0, k = 0; i < td.length; i += 4, k++) { const v = 0.299 * td[i] + 0.587 * td[i + 1] + 0.114 * td[i + 2]; tz[k] = v; tm += v; }
    tm /= tz.length;
    for (let k = 0; k < tz.length; k++) tz[k] -= tm;

    const [x1, y1, x2, y2] = REGION;
    const out = [];
    for (const it of data) {
      const img = await load(it.url);
      const c = document.createElement('canvas');
      c.width = 1280; c.height = 720;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, 1280, 720);      // 归一到 1280x720 逻辑空间
      const sw = x2 - x1, sh = y2 - y1;
      const sd = g.getImageData(x1, y1, sw, sh).data;
      const sz = new Float32Array(sw * sh);
      for (let i = 0, k = 0; i < sd.length; i += 4, k++) sz[k] = 0.299 * sd[i] + 0.587 * sd[i + 1] + 0.114 * sd[i + 2];

      let best = Infinity, bx = -1, by = -1;
      for (let oy = 0; oy <= sh - th; oy++) {
        for (let ox = 0; ox <= sw - tw; ox++) {
          let sum = 0, sm = 0;
          for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) sm += sz[(oy + y) * sw + (ox + x)];
          sm /= tw * th;
          for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
            sum += Math.abs((sz[(oy + y) * sw + (ox + x)] - sm) - tz[y * tw + x]);
          }
          const sc = sum / (tw * th);
          if (sc < best) { best = sc; bx = x1 + ox; by = y1 + oy; }
        }
      }
      out.push({ name: it.name, score: +best.toFixed(2), at: [bx, by] });
    }
    return out;
  }, { tmpl, data, REGION });

  // ── 关键：判据是「score < THRESH」，所以正样本 = 所有低分帧，不是只有第 0 个 ──
  //    单张正样本无法评估分离度：必须把全部帧按 score 排序，找**簇边界**。
  //    （早先版本把 res[0] 当唯一正样本、其余当负样本，得到"不可分"的假结论。）
  const THRESH = +(process.argv[5] || 30);
  const sorted = [...res].sort((a, b2) => a.score - b2.score);

  console.log(`\n模板 ${TMPL_SRC}  搜索区 [${REGION}]  (1280x720 逻辑空间)`);
  console.log(`判据: score < ${THRESH}  共 ${res.length} 帧（第 1 张为指定正样本）\n`);
  console.log('全部帧按 score 升序:');
  for (const r of sorted) {
    const mark = r.name === res[0].name ? ' ← 指定正样本' : '';
    console.log(`  ${String(r.score).padStart(7)}  ${r.name}  @(${r.at})${mark}`);
  }

  // 以指定正样本的分数为参照，找「最大间隙」作为簇边界
  const base = res[0].score;
  const hits = res.filter(r => r.score < THRESH);
  const miss = res.filter(r => r.score >= THRESH);
  console.log(`\n阈值 ${THRESH} 下: 命中 ${hits.length} 帧 / 未命中 ${miss.length} 帧`);
  console.log(`  命中: ${hits.map(r => `${r.name}(${r.score})`).join(' ')}`);
  const missMin = miss.length ? Math.min(...miss.map(r => r.score)) : Infinity;
  const hitMax = hits.length ? Math.max(...hits.map(r => r.score)) : -Infinity;
  console.log(`\n命中簇最大 score=${hitMax}  未命中簇最小 score=${missMin}`);
  if (miss.length === 0) {
    console.log('⚠ 全部命中 —— 阈值太松，无法判别（需更多负样本）');
  } else if (hitMax < missMin) {
    console.log(`✅ 完全可分，间隙 ${missMin - hitMax}`);
    console.log(`   建议阈值 ∈ (${hitMax}, ${missMin})，中点 ${((hitMax + missMin) / 2).toFixed(1)}`);
    console.log(`   当前 ${THRESH} → ${THRESH > hitMax && THRESH <= missMin ? '✅ 在间隙内' : '❌ 需调整'}`);
    console.log(`   两侧余量: 距命中簇 ${(THRESH - hitMax).toFixed(1)} / 距未命中簇 ${(missMin - THRESH).toFixed(1)}`);
  } else {
    console.log(`❌ 有交叠：命中簇最大 ${hitMax} ≥ 未命中簇最小 ${missMin} —— 该特征判别力不足`);
  }

  await p.close(); await b.close();
})();
