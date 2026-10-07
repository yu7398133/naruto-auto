// 用真实录制帧复核 battlePause / closeX 两个探针的判别力。
// 复刻 GameOperator/vision 的算法：区域均值 → 与目标色的曼哈顿距离 → tol + minStd 判定。
// 用法：node tools/verify-pause-probe.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'squad-frames');

// ── 探针定义（v3：白条紧贴区）────────────────────────────────────
//  locate-pause-bars.cjs 实测（战斗帧）：白条占列 x=1232~1238 与 1248~1254（各约 7px 宽），
//  行 y=22~40。该区域**只**包含两条白条，不含圆底/背景 → 白像素占比干净分离。
//    · 战斗中三帧实测：56.3% / 53.6% / 51.7%
//    · 非战斗帧同区域：≈0%
const PROBES = {
  battlePause: { area: [1232, 22, 1255, 40], color: { r: 60, g: 62, b: 55 }, tol: 70, minStd: 45 },
  closeX:      { area: [1185, 2, 1272, 70], color: { r: 102, g: 56, b: 34 }, tol: 35, minStd: 10 },
};
// 白像素判据：亮度 >= minLuma 且 三通道最大差 <= maxChroma（近中性=白条，排除彩色背景）
const WHITE = { minLuma: 150, maxChroma: 60 };
const WHITE_PCT_TH = 25;   // 白像素占比阈值（战斗中 50%+ vs 非战斗 ~0%，取中值很安全）

(async () => {
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.jpg')).sort();
  // 复用本机已在跑的调试浏览器（--remote-debugging-port=9222），
  // 避免依赖 Playwright 自带 chromium（未安装）。
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  await page.setContent('<canvas id=c></canvas>');

  const rows = [];
  for (const f of files) {
    const buf = fs.readFileSync(path.join(DIR, f)).toString('base64');
    const r = await page.evaluate(async ({ b64, probes }) => {
      const img = new Image();
      img.src = 'data:image/jpeg;base64,' + b64;
      await img.decode();
      const c = document.getElementById('c');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const sx = img.naturalWidth / 1280, sy = img.naturalHeight / 720;
      const out = { w: img.naturalWidth, h: img.naturalHeight };
      for (const [name, p] of Object.entries(probes)) {
        const [x1, y1, x2, y2] = p.area;
        const lx = Math.round(x1 * sx), ly = Math.round(y1 * sy);
        const lw = Math.max(1, Math.round((x2 - x1) * sx)), lh = Math.max(1, Math.round((y2 - y1) * sy));
        const d = ctx.getImageData(lx, ly, lw, lh).data;
        let R = 0, G = 0, B = 0, n = 0, s = 0, s2 = 0, white = 0;
        for (let i = 0; i < d.length; i += 4) {
          R += d[i]; G += d[i + 1]; B += d[i + 2];
          // ⚠ 必须与脚本 Vision.avg 完全一致：加权亮度 (77,151,28)>>8，不是简单平均
          const l = (d[i] * 77 + d[i + 1] * 151 + d[i + 2] * 28) >> 8;
          s += l; s2 += l * l; n++;
          // 白条像素：够亮 + 近中性（RGB 三通道接近，排除彩色背景）
          const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
          if (l >= 170 && mx - mn <= 40) white++;
        }
        R /= n; G /= n; B /= n;
        const mean = s / n;
        const std = Math.round(Math.sqrt(Math.max(0, s2 / n - mean * mean)));
        const dist = Math.abs(Math.round(R) - p.color.r) + Math.abs(Math.round(G) - p.color.g) + Math.abs(Math.round(B) - p.color.b);
        const stdOk = std >= (p.minStd || 0);
        out[name] = {
          avg: [Math.round(R), Math.round(G), Math.round(B)], std, dist, tol: p.tol,
          ok: dist <= p.tol && stdOk,
          whitePct: +(white / n * 100).toFixed(1),
        };
      }
      return out;
    }, { b64: buf, probes: PROBES });
    rows.push({ file: f, ...r });
  }

  console.log('file                     white%  pause_ok  p_dist p_std  p_avg');
  for (const r of rows) {
    const p = r.battlePause;
    console.log(
      r.file.padEnd(24),
      String(p.whitePct).padStart(5),
      String(p.ok).padEnd(9), String(p.dist).padStart(6), String(p.std).padStart(5),
      '(' + p.avg.join(',') + ')'
    );
  }
  console.log('\nresolution:', rows[0].w, 'x', rows[0].h);

  // ── 白像素占比的分离度分析：找出战斗段 vs 非战斗段的分布 ──────────
  const secOf0 = f => parseFloat(f.replace(/\.jpg$/, '').split('-').pop().replace('s', ''));
  const battle = rows.filter(r => r.file.startsWith('r3-') && secOf0(r.file) >= 23 && secOf0(r.file) <= 39);
  const outside = rows.filter(r => r.file.startsWith('r3-') && (secOf0(r.file) < 20 || secOf0(r.file) > 40));
  const pct = arr => arr.map(r => r.battlePause.whitePct).sort((a, b) => a - b);
  console.log('\n战斗段(23~39s) white% 升序:', pct(battle).join(' '));
  console.log('非战斗段       white% 升序:', pct(outside).join(' '));

  for (const th of [2, 3, 4, 5, 6, 8, 10]) {
    const tp = battle.filter(r => r.battlePause.whitePct >= th).length;
    const fp = outside.filter(r => r.battlePause.whitePct >= th).length;
    console.log(`  阈值 white%>=${String(th).padStart(2)}  →  战斗段命中 ${tp}/${battle.length}   非战斗段误报 ${fp}/${outside.length}`);
  }

  await browser.close();
})();
