param(
  [Parameter(Mandatory=$true)][string]$Png,
  [int]$X0 = 0, [int]$X1 = 1920,
  [int]$Y0 = 0, [int]$Y1 = 200,
  [int]$Step = 3
)
# 逐行扫描「红占比」，找出红色横条所在行（截图坐标 1920x1080）。
# 注意：必须用 -AssemblyName 的完整形式并把类型引用放在加载之后，
#   否则在 Windows PowerShell 5.1 下 [System.Drawing.Bitmap] 解析失败（TypeNotFound）。
[void][System.Reflection.Assembly]::LoadWithPartialName('System.Drawing')
Add-Type -AssemblyName System.Drawing -ErrorAction SilentlyContinue
$bmp = New-Object System.Drawing.Bitmap $Png
$rect = New-Object System.Drawing.Rectangle($X0, $Y0, ($X1 - $X0), ($Y1 - $Y0))
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$stride = [Math]::Abs($data.Stride)
$bytes = New-Object byte[] ($stride * $rect.Height)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$bmp.UnlockBits($data)

$w = $rect.Width; $h = $rect.Height
"扫描 x=$X0..$X1  y=$Y0..$Y1 (步长$Step)"
for ($y = 0; $y -lt $h; $y += $Step) {
  $red = 0; $n = 0; $sr = 0; $sg = 0; $sb = 0
  for ($x = 0; $x -lt $w; $x++) {
    $i = $y * $stride + $x * 3
    $B = $bytes[$i]; $G = $bytes[$i + 1]; $R = $bytes[$i + 2]
    $sr += $R; $sg += $G; $sb += $B; $n++
    if ((($R - $G) -gt 30) -and (($R - $B) -gt 25)) { $red++ }
  }
  $pct = $red / $n * 100
  $bar = ''
  if ($pct -ge 60) { $bar = '#' * [int]($pct / 2) }
  elseif ($pct -ge 20) { $bar = '+' * [int]($pct / 4) }
  elseif ($pct -ge 5) { $bar = '.' * [int]($pct / 2) }
  "  y=$($Y0 + $y)  red=$([math]::Round($pct,1))%  avg=($([int]($sr/$n)),$([int]($sg/$n)),$([int]($sb/$n)))  $bar"
}
