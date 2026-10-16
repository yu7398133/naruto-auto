// 忍术对战血条判据 v2：用户 2026-10-16 修正后的口径。
//
// 用户口径（修正版，逐字）：
//   "在左边血条的最左和右边血条最右，肯定有两边都是红色的，
//    因为如果有一方不是，那么意味着一方失败了，这一局也就结束了"
//
// 即：**两侧同时为红** ⟺ 本局仍在进行中。
//   这是有独立语义依据的判据（一方空血=该局已结束），比单侧"有红"强。
//
// 采样点由 png-columns.js 实测确定（1920 基准）：
//   左血条红段 x≈244..586 → 取「最左端」 x 250..300
//   右血条红段 x≈1670..1740 → 取「最右端」 x 1690..1745
//   条体 y=84..102
//
// 颜色判据：与实测纯色 (240,64,32) 的欧氏距离 ≤ 48。
//   主界面同位置无此纯色（实测命中 0.6%），故可直接排除主界面。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REF = [240, 64, 32];
const TOL = 48;
const LEFT_EDGE = [248, 84, 302, 102];   // 左血条最左端
const RIGHT_EDGE = [1688, 84, 1746, 102]; // 右血条最右端

const SAMPLES = [
  ['C:\\Users\\chenyu\\.dsh-beta\\attachments\\v1\\objects\\64\\64af0d534434328babd6a43a2d6ee36c4216a0c895a3df38ad8bb2a72c10c11e', 'BATTLE-sand', true],
  ['C:\\Users\\chenyu\\.dsh-beta\\attachments\\v1\\objects\\4a\\4a00bd56e836b991507aa8f552fcb019d3f58f44160b6bca320f52e1911cab50', 'BATTLE-white', true],
  [path.join(__dirname, '..', 'samples', 'home-2026-10-16.jpg'), 'HOME', false],
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
  const out = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return out.trim().split(',').map(Number);
}

function pct(px) {
  let hit = 0, n = px.length / 3;
  for (let i = 0; i < px.length; i += 3) {
    const dr = px[i] - REF[0], dg = px[i + 1] - REF[1], db = px[i + 2] - REF[2];
    if (Math.sqrt(dr * dr + dg * dg + db * db) <= TOL) hit++;
  }
  return hit / n * 100;
}

console.log(`判据: 左最左 red% >= T  AND  右最右 red% >= T   → 战斗中`);
console.log(`参考色 (${REF}) tol=${TOL}\n`);
console.log('样本'.padEnd(14) + '期望'.padEnd(9) + '左最左%'.padEnd(12) + '右最右%'.padEnd(12) + '判定');
console.log('-'.repeat(58));

const rows = [];
for (const [png, tag, expect] of SAMPLES) {
  if (!fs.existsSync(png)) { console.log(`${tag} 缺样本`); continue; }
  const L = pct(grab(png, LEFT_EDGE));
  const R = pct(grab(png, RIGHT_EDGE));
  rows.push({ tag, expect, L, R });
  console.log(tag.padEnd(14) + String(expect).padEnd(9) + L.toFixed(1).padEnd(12) + R.toFixed(1).padEnd(12) + '?');
}

console.log('\n--- 阈值扫描 ---');
for (const T of [10, 20, 30, 40, 50, 60, 70]) {
  let pass = 0, fail = 0, detail = '';
  for (const r of rows) {
    const got = (r.L >= T && r.R >= T);
    const ok = got === r.expect;
    if (ok) pass++; else fail++;
    detail += `${r.tag}:${ok ? 'OK' : 'X'} `;
  }
  console.log(`  T=${String(T).padStart(3)}%  →  通过 ${pass}/${rows.length}   ${detail}`);
}
