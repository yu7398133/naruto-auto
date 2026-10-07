// 用真实帧序列验证 battleWatch 状态机（延迟3s / 每1s / 连续失败3次）。
// 复刻脚本内实现（含节流+静默用虚拟时钟，以便按帧时间戳回放）。
// 用法：node tools/verify-battlewatch.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const R = [1200, 0, 1280, 80];
const LUMA = 150, CHROMA = 60, MIN_COL = 12, X_LO = 1225, X_HI = 1265;
const START_MS = 3000, POLL_MS = 1000, FAIL_NEED = 3;

(async () => {
  const dir = 'tools/squad-frames';
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = await browser.contexts()[0].newPage();
  await page.setContent('<canvas id=c></canvas>');

  const seen = async fp => {
    const b64 = fs.readFileSync(fp).toString('base64');
    return page.evaluate(async ({ b64, R, LUMA, CHROMA, MIN_COL, X_LO, X_HI }) => {
      const im = new Image(); im.src = 'data:image/jpeg;base64,' + b64; await im.decode();
      const c = document.getElementById('c');
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0);
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
        if (colCnt[x] >= MIN_COL) { if (!cur) cur = { a: x, b: x, peak: colCnt[x] }; else { cur.b = x; cur.peak = Math.max(cur.peak, colCnt[x]); } }
        else if (cur) { bars.push(cur); cur = null; }
      }
      if (cur) bars.push(cur);
      const out = bars.map(c2 => ({ x: R[0] + c2.a, w: c2.b - c2.a + 1, peak: c2.peak })).filter(b => b.x >= X_LO && b.x <= X_HI);
      if (out.length !== 2) return false;
      const [b1, b2] = out;
      const gap = b2.x - (b1.x + b1.w);
      return b1.w >= 2 && b1.w <= 16 && b2.w >= 2 && b2.w <= 16 && b1.peak >= MIN_COL && b2.peak >= MIN_COL && gap >= 6 && gap <= 20;
    }, { b64, R, LUMA, CHROMA, MIN_COL, X_LO, X_HI });
  };

  // 收集帧 + 时间戳
  const frames = fs.readdirSync(dir).filter(f => f.startsWith('r3-') && f.endsWith('.jpg'))
    .map(f => ({ f, t: parseFloat(f.replace(/\.jpg$/, '').split('-').pop().replace('s', '')) * 1000 }))
    .sort((a, b) => a.t - b.t);

  // 状态机（虚拟时钟：t0 = 第一帧时间戳）
  const t0 = frames[0].t;
  let lastAt = 0, inBattle = false, fails = 0, exited = false;
  console.log('  时间     暂停键  采样?  计数   状态');
  for (const fr of frames) {
    const now = fr.t;
    const ok = await seen(path.join(dir, fr.f));
    if (exited) continue;
    if (now - t0 < START_MS) { console.log(`  ${(now / 1000).toFixed(1).padStart(6)}s  ${ok ? '✅' : '·'}     静默    -    -`); continue; }
    if (now - lastAt < POLL_MS) { console.log(`  ${(now / 1000).toFixed(1).padStart(6)}s  ${ok ? '✅' : '·'}     节流    -    -`); continue; }
    lastAt = now;
    if (ok) { inBattle = true; fails = 0; }
    else if (inBattle) { fails++; if (fails >= FAIL_NEED) exited = true; }
    console.log(`  ${(now / 1000).toFixed(1).padStart(6)}s  ${ok ? '✅' : '❌'}     采样  ${String(fails).padStart(2)}/3  ${exited ? '【已退出战斗】' : (inBattle ? '战斗中' : '未进入')}`);
  }
  console.log(`\n最终: inBattle=${inBattle} exited=${exited} fails=${fails}`);
  console.log(exited ? '✅ 状态机成功判定退出' : '⚠ 未判定退出（录制内战斗未结束或无足够失败帧）');
  await page.close(); await browser.close();
})();
