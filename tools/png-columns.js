// 从 PNG 取一个区域，转成按列的红占比字符图（找血条边界）。
// 用法: node tools/png-columns.js <png> <x0> <y0> <w> <h> [列步长]
const { execFileSync } = require('child_process');
const fs = require('fs');

const png = process.argv[2];
const x0 = +process.argv[3], y0 = +process.argv[4], W = +process.argv[5], H = +process.argv[6];
const step = +(process.argv[7] || 4);

const ps = `
[void][System.Reflection.Assembly]::LoadWithPartialName('System.Drawing')
Add-Type -AssemblyName System.Drawing -ErrorAction SilentlyContinue
$img = New-Object System.Drawing.Bitmap '${png.replace(/'/g, "''")}'
$rect = New-Object System.Drawing.Rectangle(${x0},${y0},${W},${H})
$d = $img.LockBits($rect,[System.Drawing.Imaging.ImageLockMode]::ReadOnly,[System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$st=[Math]::Abs($d.Stride); $b=New-Object byte[] ($st*${H})
[System.Runtime.InteropServices.Marshal]::Copy($d.Scan0,$b,0,$b.Length); $img.UnlockBits($d); $img.Dispose()
$o=@()
for($y=0;$y -lt ${H};$y++){ for($x=0;$x -lt ${W};$x++){
  $i=$y*$st+$x*3
  $o += [int]$b[$i+2]; $o += [int]$b[$i+1]; $o += [int]$b[$i]
}}
Write-Output ($o -join ',')
`;

const out = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const px = out.trim().split(',').map(Number);
if (px.length !== W * H * 3) { console.error('像素数不符', px.length, '期望', W * H * 3); process.exit(1); }

// 参考战斗血条红
const REF = [240, 64, 32], TOL = 48;
const near = (R, G, B) => {
  const dr = R - REF[0], dg = G - REF[1], db = B - REF[2];
  return Math.sqrt(dr * dr + dg * dg + db * db) <= TOL;
};

console.log(`区域 x=${x0}..${x0 + W} y=${y0}..${y0 + H}   参考红(${REF}) tol=${TOL}`);
let line = '', marks = '';
for (let x = 0; x < W; x += step) {
  let hit = 0, n = 0;
  for (let y = 0; y < H; y++) {
    for (let dx = 0; dx < step && x + dx < W; dx++) {
      const i = (y * W + x + dx) * 3;
      if (near(px[i], px[i + 1], px[i + 2])) hit++;
      n++;
    }
  }
  const p = hit / n * 100;
  line += p >= 80 ? '#' : p >= 50 ? '+' : p >= 20 ? '.' : ' ';
  marks += (x % 100 < step) ? '|' : ' ';
}
console.log('     ' + marks);
console.log(`x=${x0} ` + line + ` x=${x0 + W}`);
console.log('     每字符=' + step + 'px  #>=80% +>=50% .>=20%');
