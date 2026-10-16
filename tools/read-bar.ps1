param(
  [Parameter(Mandatory=$true)][string]$Png,
  [Parameter(Mandatory=$true)][int]$X0,
  [Parameter(Mandatory=$true)][int]$Y0,
  [Parameter(Mandatory=$true)][int]$X1,
  [Parameter(Mandatory=$true)][int]$Y1,
  [string]$Label = ''
)
# Sample a region on ANY-size screenshot using 1920x1080 baseline coords.
# ASCII only: Windows PowerShell 5.1 reads .ps1 as GBK and mangles UTF-8.
[void][System.Reflection.Assembly]::LoadWithPartialName('System.Drawing')
Add-Type -AssemblyName System.Drawing -ErrorAction SilentlyContinue
$img = New-Object System.Drawing.Bitmap $Png

$f = $img.Width / 1920.0
$rx = [int][Math]::Round($X0 * $f); $ry = [int][Math]::Round($Y0 * $f)
$rw = [int][Math]::Round(($X1 - $X0) * $f); $rh = [int][Math]::Round(($Y1 - $Y0) * $f)
if ($rx -lt 0) { $rx = 0 }; if ($ry -lt 0) { $ry = 0 }
if ($rw -lt 1) { $rw = 1 }; if ($rh -lt 1) { $rh = 1 }
if ($rx + $rw -gt $img.Width) { $rw = $img.Width - $rx }
if ($ry + $rh -gt $img.Height) { $rh = $img.Height - $ry }

$rect = New-Object System.Drawing.Rectangle($rx, $ry, $rw, $rh)
$data = $img.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$stride = [Math]::Abs($data.Stride)
$bytes = New-Object byte[] ($stride * $rh)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$img.UnlockBits($data)
$imgW = $img.Width
$img.Dispose()

$counts = @{}
$sumR = 0; $sumG = 0; $sumB = 0; $n = 0; $redN = 0
for ($y = 0; $y -lt $rh; $y++) {
  for ($x = 0; $x -lt $rw; $x++) {
    $i = $y * $stride + $x * 3
    $B = $bytes[$i]; $G = $bytes[$i + 1]; $R = $bytes[$i + 2]
    $sumR += $R; $sumG += $G; $sumB += $B; $n++
    if ((($R - $G) -gt 30) -and (($R - $B) -gt 25)) {
      $redN++
      $k = "$([int]($R / 16) * 16),$([int]($G / 16) * 16),$([int]($B / 16) * 16)"
      if ($counts.ContainsKey($k)) { $counts[$k]++ } else { $counts[$k] = 1 }
    }
  }
}
if ($n -eq 0) { Write-Output "$Label | EMPTY"; exit }

$avgR = [int]($sumR / $n); $avgG = [int]($sumG / $n); $avgB = [int]($sumB / $n)
$redPct = [math]::Round($redN / $n * 100, 1)
Write-Output "$Label | imgW=$imgW | px=($rx,$ry ${rw}x${rh}) | avg=($avgR,$avgG,$avgB) | redPct=$redPct"
if ($redN -gt 0) {
  $counts.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 4 | ForEach-Object {
    $p = [math]::Round($_.Value / $n * 100, 1)
    Write-Output "      bucket $($_.Key)  pct=$p%"
  }
}
