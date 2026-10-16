// 战斗血条判据：用「纯色块集中度」而非单纯红占比，避开主界面杂色。
//
// 用户洞察（2026-10-16）：
//   主界面的红（屋顶/树/招牌杂色）与战斗血条的**不是同一种红**，可精准写颜色。
// 实测确认：
//   战斗血条 (240,64,32) 单一色块占 52% —— 游戏 UI 纯色填充
//   主界面 最高色块仅 0.8% —— 全是分散杂色
//   ⇒ 判据 = 「指定色相范围内，单一色块是否高度集中」
//
// 为什么不用单纯 redPct：
//   主界面 redPct=24.1% 也会过阈值 → 误判为战斗（2026-10-16 已复现该误判）。
//
// 样本全部按 1920 基准坐标取，自动适配图片实际宽度。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SAMPLES = [
  { png: 'C:\\Users\\chenyu\\.dsh-beta\\attachments\\v1\\objects\\64\\64af0d534434328babd6a43a2d6ee36c4216a0c895a3df38ad8bb2a72c10c11e', tag: 'BATTLE-sand ', expect: true },
  { png: 'C:\\Users\\chenyu\\.dsh-beta\\attachments\\v1\\objects\\4a\\4a00bd56e836b991507aa8f552fcb019d3f58f44160b6bca320f52e1911cab50', tag: 'BATTLE-white', expect: true },
  { png: path.join(__dirname, '..', 'samples', 'home-2026-10-16.jpg'), tag: 'HOME        ', expect: false },
];

// 左血条条体（1920 基准）
const BAR = [262, 86, 560, 100];

// 参考色：战斗血条实测主色
const BAR_REF = { r: 240, g: 64, b: 32 };
const TOL = 48;

function sample(png, area) {
  const ps = path.join(__dirname, 'read-bar.ps1');
  const out = execFileSync('powershell', ['-NoProfile', '-File', ps,
    '-Png', png, '-X0', String(area[0]), '-Y0', String(area[1]),
    '-X1', String(area[2]), '-Y1', String(area[3]), '-Label', 'X'], { encoding: 'utf8' });
  return out;
}

// 用 PNG 原始像素做纯 JS 分析：这里直接调 read-bar 拿不到逐像素，改走 powershell 输出 JSON
function sampleJson(png, area) {
  const ps = `
[void][System.Reflection.Assembly]::LoadWithPartialName('System.Drawing')
Add-Type -AssemblyName System.Drawing -ErrorAction SilentlyContinue
$img = New-Object System.Drawing.Bitmap ${JSON.stringify(png)}
$f = $img.Width / 1920.0
$rx=[int][Math]::Round(${area[0]}*$f); $ry=[int][Math]::Round(${area[1]}*$f)
$rw=[int][Math]::Round((${area[2]}-${area[0]})*$f); $rh=[int][Math]::Round((${area[3]}-${area[1]})*$f)
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
  const nums = out.trim().split(',').map(Number);
  return nums;
}

// 判据：在区域内，与参考红色接近的像素占比 + 该色块的集中度
function judge(px) {
  const n = px.length / 3;
  let hit = 0;
  for (let i = 0; i < px.length; i += 3) {
    const dr = px[i] - BAR_REF.r, dg = px[i + 1] - BAR_REF.g, db = px[i + 2] - BAR_REF.b;
    if (Math.sqrt(dr * dr + dg * dg + db * db) <= TOL) hit++;
  }
  return { pct: hit / n * 100, n };
}

console.log(`参考色 (${BAR_REF.r},${BAR_REF.g},${BAR_REF.b}) 容差 ${TOL}（欧氏距离）`);
console.log(`区域 = 左血条条体 ${JSON.stringify(BAR)} (1920 基准)\n`);
console.log('样本'.padEnd(14) + '期望'.padEnd(8) + '命中%'.padEnd(10) + '判定');
console.log('-'.repeat(46));

let pass = 0, fail = 0;
const THRESH = 35; // 待定，看分离度

for (const s of SAMPLES) {
  if (!fs.existsSync(s.png)) { console.log(`${s.tag} 缺样本`); continue; }
  const px = sampleJson(s.png, BAR);
  const r = judge(px);
  const got = r.pct >= THRESH;
  const ok = got === s.expect;
  if (ok) pass++; else fail++;
  console.log(s.tag.padEnd(14) + String(s.expect).padEnd(8) + r.pct.toFixed(1).padEnd(10) + (ok ? 'OK' : 'MISMATCH'));
}

console.log('-'.repeat(46));
console.log(`阈值 ${THRESH}%  →  通过 ${pass} / 失败 ${fail}`);
