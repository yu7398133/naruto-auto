// 用与脚本**完全相同的算法**（CLS_HPBAR_RED + HPBAR_HIT_PCT + 两侧 AND）
// 回放三张真实样本，证明判据在真机上会得到预期结论。
//
// 与 test-hpbar-judge2.js 的区别：那个是探索版（可调阈值）；
// 这个是**验收版** —— 常量与脚本一致，只输出 通过/不通过。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// ↓↓↓ 必须与 naruto-auto.user.js 中的常量逐字一致 ↓↓↓
const HPBAR_REF = { r: 240, g: 64, b: 32 };
const HPBAR_TOL = 48;
const HPBAR_LEFT_EDGE = [248, 84, 302, 102];
const HPBAR_RIGHT_EDGE = [1688, 84, 1746, 102];
const HPBAR_HIT_PCT = 15;
// ↑↑↑ 一致性由 test-v073-hpbar.js 保证 ↑↑↑

const CLS = (() => {
  const { r: R, g: G, b: B } = HPBAR_REF, T2 = HPBAR_TOL * HPBAR_TOL;
  return (r, g, b) => { const dr = r - R, dg = g - G, db = b - B; return dr * dr + dg * dg + db * db <= T2; };
})();

const SAMPLES = [
  // [路径, 标签, 期望单帧判为战斗?]
  //  ⚠ 白光帧期望 false 是**设计如此**：大招特效物理遮盖血条（左端实测 0.0%）。
  //    单帧判据本就不该在这帧说「战斗」；8s 闩锁负责让连点宏在这 8s 内不停手。
  //    把它写成 true 就是把「单帧判据」和「闩锁」的职责混为一谈 —— 那是错误的验收标准。
  ['C:\\Users\\chenyu\\.dsh-beta\\attachments\\v1\\objects\\64\\64af0d534434328babd6a43a2d6ee36c4216a0c895a3df38ad8bb2a72c10c11e', '战斗-沙地', true],
  ['C:\\Users\\chenyu\\.dsh-beta\\attachments\\v1\\objects\\4a\\4a00bd56e836b991507aa8f552fcb019d3f58f44160b6bca320f52e1911cab50', '战斗-白光', false],
  [path.join(__dirname, '..', 'samples', 'home-2026-10-16.jpg'), '主界面', false],
];

function grab(png, area) {
  const [x0, y0, x1, y1] = area;
  const ps = `
[void][System.Reflection.Assembly]::LoadWithPartialName('System.Drawing')
Add-Type -AssemblyName System.Drawing -ErrorAction SilentlyContinue
$img = New-Object System.Drawing.Bitmap '${png.replace(/'/g, "''")}'
$f = $img.Width / 1920.0
$rx=[int][Math]::Round(${x0}*$f); $ry=[int][Math]::Round(${y0}*$f)
$rw=[int][Math]::Round((${x1}-${x0})*$f); $rh=[int][Math]::Round((${y1}-${y0})*$f)
if($rw -lt 1){$rw=1}; if($rh -lt 1){$rh=1}
if($rx+$rw -gt $img.Width){$rw=$img.Width-$rx}
if($ry+$rh -gt $img.Height){$rh=$img.Height-$ry}
$rect = New-Object System.Drawing.Rectangle($rx,$ry,$rw,$rh)
$d = $img.LockBits($rect,[System.Drawing.Imaging.ImageLockMode]::ReadOnly,[System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$st=[Math]::Abs($d.Stride); $b=New-Object byte[] ($st*$rh)
[System.Runtime.InteropServices.Marshal]::Copy($d.Scan0,$b,0,$b.Length); $img.UnlockBits($d); $img.Dispose()
$o=@()
for($y=0;$y -lt $rh;$y++){ for($x=0;$x -lt $rw;$x++){
  $i=$y*$st+$x*3
  $o += [int]$b[$i+2]; $o += [int]$b[$i+1]; $o += [int]$b[$i]
}}
Write-Output ($o -join ',')
`;
  return execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
    .trim().split(',').map(Number);
}
function pct(px) {
  let hit = 0; const n = px.length / 3;
  for (let i = 0; i < px.length; i += 3) if (CLS(px[i], px[i + 1], px[i + 2])) hit++;
  return hit / n * 100;
}

console.log('判据 = 左端% >= ' + HPBAR_HIT_PCT + '  AND  右端% >= ' + HPBAR_HIT_PCT + '   ⇒ 战斗中');
console.log('（与 naruto-auto.user.js 常量一致，由 test-v073-hpbar.js 校验）\n');
console.log('样本'.padEnd(12) + '左端%'.padEnd(10) + '右端%'.padEnd(10) + '判为战斗'.padEnd(11) + '结果');
console.log('-'.repeat(56));

let pass = 0, fail = 0;
for (const [png, tag, expectBattle] of SAMPLES) {
  if (!fs.existsSync(png)) { console.log(`${tag.padEnd(12)}缺样本`); continue; }
  const L = pct(grab(png, HPBAR_LEFT_EDGE));
  const R = pct(grab(png, HPBAR_RIGHT_EDGE));
  const judgedBattle = (L >= HPBAR_HIT_PCT && R >= HPBAR_HIT_PCT);
  const ok = judgedBattle === expectBattle;
  if (ok) pass++; else fail++;
  console.log(tag.padEnd(12) + L.toFixed(1).padEnd(10) + R.toFixed(1).padEnd(10)
    + String(judgedBattle).padEnd(11) + (ok ? 'OK' : `X 期望 ${expectBattle}`));
}
console.log('-'.repeat(56));
console.log(`通过 ${pass} / 失败 ${fail}`);
console.log('\n注：白光帧左端为 0% → 单帧判为「非战斗」，由 8s 闩锁承接（设计如此）。');
