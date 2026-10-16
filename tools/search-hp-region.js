// 候选区域的「正负样本分离度」扫描。
//
// 目标：找一个区域，使
//   战斗(白光闪)  ✅命中
//   战斗(沙地)    ✅命中
//   主界面        ❌不命中
//
// 2026-10-16 失败记录（必须避免重演）：
//   [60,20,430,70] → 主界面 red%=57.6 因为框住了「右上角金色战力/头像框」，不是血条
//   [95,30,400,55] → 战斗白光帧 red%=0 因为白光把整片冲白
//
// 本脚本对**一批候选区域**做正负对照，输出分离度表，不做任何接线。
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'samples');
const W = 1280, H = 720;

const SAMPLES = [
  ['battle-white-flash', true],
  ['battle-arena-normal', true],
  ['home-2026-10-16', false],
];

function load(n) {
  const p = path.join(DIR, n + '.raw');
  if (!fs.existsSync(p)) return null;
  const b = fs.readFileSync(p);
  return b.length === W * H * 3 ? b : null;
}

// 多种「红」判据，找一个对白光也稳的
const TESTS = {
  'R-G>45&R-B>35&R>90': (R, G, B) => R > 90 && R - G > 45 && R - B > 35,
  'R-G>30&R-B>25': (R, G, B) => R - G > 30 && R - B > 25,
  'R>G*1.5&R>B*1.5': (R, G, B) => R > G * 1.5 && R > B * 1.5,
  'R-G>25&R>100': (R, G, B) => R > 100 && R - G > 25,
};

function pct(buf, area, test) {
  const [x0, y0, x1, y1] = area;
  let hit = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 3;
      if (test(buf[i], buf[i + 1], buf[i + 2])) hit++;
      n++;
    }
  }
  return hit / n * 100;
}

// 候选：瞄准「血条条体本身」——从红图上看到条体在 y≈88..104, x≈170 起
const CANDIDATES = [
  ['条体薄带 y88-104', [175, 88, 430, 104]],
  ['条体薄带 y92-100', [175, 92, 430, 100]],
  ['条体加框 y84-108', [175, 84, 430, 108]],
  ['条体前半 y88-104', [175, 88, 300, 104]],
  ['条体后半 y88-104', [300, 88, 430, 104]],
  ['条体 x175-400',    [175, 88, 400, 104]],
];

const bufs = {};
for (const [n] of SAMPLES) bufs[n] = load(n);

console.log('正样本 = 战斗帧（应命中）；负样本 = 主界面（应不命中）\n');

for (const [tname, test] of Object.entries(TESTS)) {
  console.log('════ 判据: ' + tname + ' ════');
  console.log('  区域'.padEnd(22) + SAMPLES.map(s => s[0].padEnd(20)).join('') + '分离');
  for (const [cname, area] of CANDIDATES) {
    const vals = SAMPLES.map(([n]) => {
      const b = bufs[n];
      return b ? pct(b, area, test) : NaN;
    });
    const posMin = Math.min(vals[0], vals[1]);
    const neg = vals[2];
    const sep = posMin - neg;
    let mark;
    if (!isFinite(sep)) mark = '缺样本';
    else if (posMin >= 20 && neg <= 5 && sep >= 20) mark = '✅ 可分离';
    else if (sep > 10) mark = '△ 偏弱';
    else mark = '❌ 重叠';
    console.log('  ' + cname.padEnd(20) +
      vals.map(v => (isFinite(v) ? v.toFixed(1) + '%' : '-').padEnd(20)).join('') +
      ' 正最小=' + (isFinite(posMin) ? posMin.toFixed(1) : '-') + ' 负=' + (isFinite(neg) ? neg.toFixed(1) : '-') + '  → ' + mark);
  }
  console.log();
}
