// 战斗判据「正面血条 red + 反面排除主界面/结算」正负样本实测。
//
// 用户口径（2026-10-16）：血条红在主界面也有（战力条），
//   但主界面有**独有特征**（右上红叉、好友/邮件图标等）→ 拿它们做反面排除即可。
//
// 判据草案：
//   inBattle = 血条红(≥阈值)  AND  NOT 主界面特征命中  AND  NOT 结算特征命中
//
// 反面特征（脚本坐标 1280x720）：
//   主界面：右上角红叉/关闭位、左侧竖排图标、底部菜单条
//   结算：右下「确定/返回」大按钮区
//
// 本脚本只做**离线正负对照**，不接线。
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'samples');
const W = 1280, H = 720;

const SAMPLES = [
  ['battle-white-flash', 'battle', '战斗(白光)'],
  ['battle-arena-normal', 'battle', '战斗(沙地)'],
  ['home-2026-10-16', 'home', '主界面'],
];

function load(n) {
  const p = path.join(DIR, n + '.raw');
  if (!fs.existsSync(p)) return null;
  const b = fs.readFileSync(p);
  return b.length === W * H * 3 ? b : null;
}

const isRed = (R, G, B) => R - G > 30 && R - B > 25;
const isDark = (R, G, B) => (0.299 * R + 0.587 * G + 0.114 * B) < 60;
const luma = (R, G, B) => 0.299 * R + 0.587 * G + 0.114 * B;

function stats(buf, area) {
  const [x0, y0, x1, y1] = area;
  let red = 0, dark = 0, n = 0, lum = 0, std = 0;
  const ls = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 3;
      const R = buf[i], G = buf[i + 1], B = buf[i + 2];
      if (isRed(R, G, B)) red++;
      if (isDark(R, G, B)) dark++;
      const L = luma(R, G, B); ls.push(L); lum += L; n++;
    }
  }
  lum /= n;
  for (const L of ls) std += (L - lum) * (L - lum);
  std = Math.sqrt(std / n);
  return { redPct: +(red / n * 100).toFixed(1), darkPct: +(dark / n * 100).toFixed(1), lum: +lum.toFixed(1), std: +std.toFixed(1), n };
}

// 拟定区域
const F = {
  // 正面：血条条体（避开左侧头像框）
  hpBar: [175, 88, 430, 104],
  // 反面候选（主界面独有 / 结算独有）
  homeCloseX: [1195, 20, 1260, 80],     // 主界面右上角（红叉/活动入口）
  homeLeftIcons: [95, 160, 175, 470],   // 主界面左侧竖排图标带
  homeBottomBar: [300, 640, 1000, 700], // 主界面底部菜单
  settleBtn: [520, 600, 780, 700],      // 结算页底部大按钮
  battleRound: [600, 10, 720, 90],      // 战斗回合数「第X回」
};

const bufs = {};
for (const [n] of SAMPLES) bufs[n] = load(n);

console.log('区域统计（红% / 暗% / 亮度 / 反差）\n');
console.log('区域'.padEnd(16) + SAMPLES.map(s => (s[2] || s[0]).padEnd(24)).join(''));
for (const [fname, area] of Object.entries(F)) {
  let line = fname.padEnd(14);
  for (const [n] of SAMPLES) {
    const b = bufs[n];
    if (!b) { line += '-'.padEnd(24); continue; }
    const s = stats(b, area);
    line += `红${String(s.redPct).padStart(5)}% 暗${String(s.darkPct).padStart(5)}% L${String(s.lum).padStart(5)}`.padEnd(24);
  }
  console.log(line);
}

console.log('\n--- 分离度检查（战斗 vs 主界面）---');
for (const [fname, area] of Object.entries(F)) {
  const p = bufs['battle-arena-normal'] ? stats(bufs['battle-arena-normal'], area) : null;
  const w = bufs['battle-white-flash'] ? stats(bufs['battle-white-flash'], area) : null;
  const h = bufs['home-2026-10-16'] ? stats(bufs['home-2026-10-16'], area) : null;
  if (!p || !h) continue;
  const dRed = Math.abs(p.redPct - h.redPct);
  const dDark = Math.abs(p.darkPct - h.darkPct);
  const dLum = Math.abs(p.lum - h.lum);
  console.log(`  ${fname.padEnd(14)} |Δ红|=${dRed.toFixed(1).padStart(6)}  |Δ暗|=${dDark.toFixed(1).padStart(6)}  |Δ亮度|=${dLum.toFixed(1).padStart(6)}` +
    (w ? `   白光帧: 红${w.redPct}% 暗${w.darkPct}% L${w.lum}` : ''));
}
