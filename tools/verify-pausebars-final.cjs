// 用真实帧验证 findPauseBars 的**最终判据**（与脚本内实现逐条一致）。
// 正样本 = 战斗中；负样本 = 主界面/准备页/结算页。
// 用法：node tools/verify-pausebars-final.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const R = [1200, 0, 1280, 80];
const LUMA = 150, CHROMA = 60, MIN_COL = 12;

// 正样本：已知含暂停键的战斗帧（小队突袭战斗 + 秘境战斗）
//  ⚠ 修正：*秘境-first.jpg 经视觉复核确认**是战斗画面**（有技能键/摇杆/计时 00:09:41/暂停键），
//    原先误归为负样本导致"误报"，实为标注错误。
const POS = [
  'tools/squad-frames/r3-05-27.0s.jpg', 'tools/squad-frames/r3-06-27.2s.jpg',
  'tools/squad-frames/r3-07-23.5s.jpg', 'tools/squad-frames/r3-13-30.1s.jpg',
  'tools/squad-frames/r3-17-31.7s.jpg', 'tools/squad-frames/r3-25-35.0s.jpg',
  'tools/squad-frames/r3-31-36.6s.jpg', 'tools/squad-frames/r3-40-38.4s.jpg',
  'tools/realms/缸体战斗2-frame1.jpg', 'tools/realms/缸体战斗2-frame2.jpg',
  'tools/realms/罡体秘境-first.jpg', 'tools/realms/阴阳秘境-first.jpg',
  'tools/realms/落岩秘境-first.jpg',
];
// 负样本：非战斗界面（准备页/结算页/主界面）
const NEG = [
  'tools/squad-frames/r3-01-0.0s.jpg', 'tools/squad-frames/r3-04-4.2s.jpg',
  'tools/squad-frames/r3-05-8.2s.jpg', 'tools/squad-frames/r3-06-11.3s.jpg',
  'tools/squad-frames/r3-13-38.7s.jpg', 'tools/squad-frames/r3-14-44.4s.jpg',
  'tools/squad-frames/r3-40-85.4s.jpg', 'tools/squad-frames/r3-41-89.6s.jpg',
  'tools/realms/挑战券0-prepare.jpg', 'tools/realms/毒风-prepare.jpg',
  'tools/realms/水牢-prepare.jpg', 'tools/realms/烈焰-prepare.jpg',
  'tools/realms/缸体战斗2-prepare.jpg', 'tools/realms/罡体战斗-prepare.jpg',
  'tools/realms/毒风-last.jpg', 'tools/realms/水牢-last.jpg',
  'tools/realms/烈焰-last.jpg', 'tools/realms/落岩2-prepare.jpg',
];

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = await browser.contexts()[0].newPage();
  await page.setContent('<canvas id=c></canvas>');

  const run = async fp => {
    const b64 = fs.readFileSync(fp).toString('base64');
    return page.evaluate(async ({ b64, R, LUMA, CHROMA, MIN_COL }) => {
      const im = new Image();
      im.src = 'data:image/jpeg;base64,' + b64;
      await im.decode();
      const c = document.getElementById('c');
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(im, 0, 0);
      const lw = R[2] - R[0], lh = R[3] - R[1];
      const d = ctx.getImageData(R[0], R[1], lw, lh).data;
      const colCnt = new Array(lw).fill(0);
      for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
        const i = (y * lw + x) * 4;
        const l = (d[i] * 77 + d[i + 1] * 151 + d[i + 2] * 28) >> 8;
        const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
        if (l >= LUMA && mx - mn <= CHROMA) colCnt[x]++;
      }
      const bars = []; let cur = null;
      for (let x = 0; x < lw; x++) {
        if (colCnt[x] >= MIN_COL) {
          if (!cur) cur = { a: x, b: x, peak: colCnt[x] };
          else { cur.b = x; cur.peak = Math.max(cur.peak, colCnt[x]); }
        } else if (cur) { bars.push(cur); cur = null; }
      }
      if (cur) bars.push(cur);
      const out = bars.map(c2 => ({ x: R[0] + c2.a, w: c2.b - c2.a + 1, peak: c2.peak }));
      // 与脚本一致：先按 x 波段过滤假簇，再要求恰好 2 条
      const inBand = b => b.x >= 1225 && b.x <= 1265;
      const cand = out.filter(inBand);
      if (cand.length !== 2) return { ok: false, bars: out };
      const [b1, b2] = cand;
      const thin = b => b.w >= 2 && b.w <= 16;
      const tall = b => b.peak >= MIN_COL;
      const gap = b2.x - (b1.x + b1.w);
      return { ok: thin(b1) && thin(b2) && tall(b1) && tall(b2) && gap >= 6 && gap <= 20, bars: out, gap };
    }, { b64, R, LUMA, CHROMA, MIN_COL });
  };

  let tp = 0, fn = 0, tn = 0, fp = 0;
  console.log('── 正样本（应 ok=true）──');
  for (const f of POS) {
    if (!fs.existsSync(f)) { console.log('  skip(missing)', f); continue; }
    const r = await run(f);
    if (r.ok) tp++; else fn++;
    console.log(`  ${r.ok ? '✅' : '❌ 漏报'} ${path.basename(f).padEnd(26)} bars=${r.bars.length} ${JSON.stringify(r.bars)}`);
  }
  console.log('── 负样本（应 ok=false）──');
  for (const f of NEG) {
    if (!fs.existsSync(f)) { console.log('  skip(missing)', f); continue; }
    const r = await run(f);
    if (r.ok) fp++; else tn++;
    if (r.ok) console.log(`  ❌ 误报 ${path.basename(f).padEnd(26)} bars=${JSON.stringify(r.bars)}`);
  }
  console.log(`\n结果：正样本命中 ${tp}/${tp + fn}   负样本正确排除 ${tn}/${tn + fp}   误报 ${fp}`);
  await page.close();
  await browser.close();
})();
