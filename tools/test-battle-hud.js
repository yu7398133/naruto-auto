// 顶部血条 HUD 判据：正负样本离线对照。
//
// 用户口径（2026-10-16）：
//   ① 血量会掉到空，但**条形框体始终在** → 只能判「条状结构存在」，不能判填充量
//   ② 「两边不可能都是残血 → 左边血条的最左、右边血条的最右，至少有一方是红色」
//
// 判据设计（据此）：
//   左血条取**最左端**一小段、右血条取**最右端**一小段，
//   两端「至少一个够红」即判在战斗。红 = R 明显高于 G/B。
//
// 为什么不判整条：整条在残血时右半是暗底，均值会被拉平；
//   而两端恒为「贴边的那一端」，只要有一方满血/半血就必然是红条起点。
//
// 样本：samples/*.raw（1280x720 raw RGB，由 tools/dump-frame-raw.js 从 canvas 导出）
// 正样本 = 战斗帧；负样本 = 主界面帧。
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'samples');
const W = 1280, H = 720;

function loadRaw(name) {
  const p = path.join(DIR, name + '.raw');
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p);
}

// 在脚本坐标系 (1280x720) 上取区域统计
function stat(buf, area) {
  const [x0, y0, x1, y1] = area;
  let r = 0, g = 0, b = 0, n = 0, red = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 3;
      const R = buf[i], G = buf[i + 1], B = buf[i + 2];
      r += R; g += G; b += B; n++;
      // 「红」判据：R 比 G/B 都高出一截（血条红 ~ (200,40,50)；底色/亮光不满足）
      if (R > 90 && R - G > 45 && R - B > 35) red++;
    }
  }
  return {
    avg: [Math.round(r / n), Math.round(g / n), Math.round(b / n)],
    redPct: +(red / n * 100).toFixed(1),
    n,
  };
}

// 血条两端（脚本坐标，按 1280x720）
//   从截图看：左血条条体约 x 95..400，右血条约 x 1010..1230，y 约 32..52
const REGIONS = {
  左血条最左端: [95, 30, 145, 55],
  左血条整条:   [95, 30, 400, 55],
  右血条最右端: [1180, 30, 1230, 55],
  右血条整条:   [1010, 30, 1230, 55],
  // 对照：主界面同位置（应无红条）
  顶部中间:     [560, 10, 720, 80],
};

const SAMPLES = [
  ['battle-white-flash',  '战斗(白光闪)'],
  ['battle-arena-normal', '战斗(沙地常态)'],
  ['home-2026-10-16',     '主界面(负样本)'],
];

console.log('样本:', SAMPLES.filter(s => loadRaw(s[0])).map(s => s[0]).join(', '));
console.log();

const rows = {};
for (const [file, label] of SAMPLES) {
  const buf = loadRaw(file);
  if (!buf) { console.log(`⚠ 缺样本 ${file}.raw`); continue; }
  if (buf.length !== W * H * 3) { console.log(`⚠ ${file}.raw 尺寸异常 ${buf.length}`); continue; }
  rows[file] = { label, r: {} };
  for (const [rn, area] of Object.entries(REGIONS)) rows[file].r[rn] = stat(buf, area);
}

// 打印对照表
const regionNames = Object.keys(REGIONS);
console.log('=== 各区域「红色像素占比 %」对照 ===');
console.log('区域'.padEnd(14) + SAMPLES.map(s => (s[1] || s[0]).padEnd(18)).join(''));
for (const rn of regionNames) {
  let line = rn.padEnd(12);
  for (const [file] of SAMPLES) {
    const v = rows[file] && rows[file].r[rn];
    line += (v ? String(v.redPct) : '-').padEnd(18);
  }
  console.log(line);
}

console.log('\n=== 各区域平均 RGB ===');
for (const rn of regionNames) {
  console.log('--- ' + rn);
  for (const [file] of SAMPLES) {
    const v = rows[file] && rows[file].r[rn];
    if (v) console.log(`    ${(rows[file].label).padEnd(16)} avg=${JSON.stringify(v.avg)} red%=${v.redPct}`);
  }
}

// 判据模拟：两端至少一端够红
console.log('\n=== 判据「左最左端 或 右最右端 至少一端 red% ≥ 阈值」 ===');
for (const th of [3, 5, 8, 10, 15, 20]) {
  let line = `  阈值 ${String(th).padStart(3)}%  →  `;
  for (const [file] of SAMPLES) {
    const v = rows[file];
    if (!v) { line += '-'.padEnd(18); continue; }
    const L = v.r['左血条最左端'].redPct, R = v.r['右血条最右端'].redPct;
    const hit = (L >= th || R >= th);
    line += `${hit ? '✅战斗' : '❌非战斗'}(L${L}/R${R})`.padEnd(22);
  }
  console.log(line);
}
