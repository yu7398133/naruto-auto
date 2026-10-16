// 从**原始 PNG 截图**取色（不经我的 .raw 管线）。
//
// 背景：2026-10-16 发现 tools/dump-frame-raw.js 导出的大缓冲区行错位，
//   导致基于 .raw 的所有测量作废。本脚本改用 System.Drawing 直接读用户发的原始 PNG，
//   绕开自造解码器。
//
// 用法: node tools\read-png-region.js <png路径> <x0,y0,x1,y1> [标签]
//   坐标用 **1920x1080 截图坐标**。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const png = process.argv[2];
const c = (process.argv[3] || '').split(',').map(Number);
const label = process.argv[4] || '';
if (!png || c.length !== 4) {
  console.error('用法: node tools/read-png-region.js <png> <x0,y0,x1,y1> [标签]');
  process.exit(1);
}

// 用 PowerShell + System.Drawing 读像素（Windows 自带，无需第三方库）
const ps = `
Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile(${JSON.stringify(path.resolve(png))})
$rect = New-Object System.Drawing.Rectangle(${c[0]}, ${c[1]}, ${c[2] - c[0]}, ${c[3] - c[1]})
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$bytes = New-Object byte[] ([Math]::Abs($data.Stride) * $rect.Height)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$bmp.UnlockBits($data)
$stride = [Math]::Abs($data.Stride)
$w = $rect.Width; $h = $rect.Height
$counts = @{}
$sumR=0; $sumG=0; $sumB=0; $n=0; $redN=0
for($y=0; $y -lt $h; $y++){
  for($x=0; $x -lt $w; $x++){
    $i = $y*$stride + $x*3
    $B = $bytes[$i]; $G = $bytes[$i+1]; $R = $bytes[$i+2]
    $sumR+=$R; $sumG+=$G; $sumB+=$B; $n++
    if(($R - $G) -gt 30 -and ($R - $B) -gt 25){
      $redN++
      $k = "$([int]($R/16)*16),$([int]($G/16)*16),$([int]($B/16)*16)"
      if($counts.ContainsKey($k)){ $counts[$k]++ } else { $counts[$k]=1 }
    }
  }
}
"REGION $($w)x$($h)  n=$n  avg=($([int]($sumR/$n)),$([int]($sumG/$n)),$([int]($sumB/$n)))  red=$redN ($([math]::Round($redN/$n*100,1))%)"
$counts.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 8 | ForEach-Object {
  "  BUCKET $($_.Key)  count=$($_.Value)  pct=$([math]::Round($_.Value/$n*100,1))%"
}
$bmp.Dispose()
`;

const out = execFileSync('pwsh', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
console.log(`样本: ${path.basename(png)}  ${label}`);
console.log(`区域(截图坐标): (${c[0]},${c[1]})-(${c[2]},${c[3]})`);
console.log(out.trim());
