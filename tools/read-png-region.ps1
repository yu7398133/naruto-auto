param(
  [Parameter(Mandatory=$true)][string]$Png,
  [Parameter(Mandatory=$true)][int]$X0,
  [Parameter(Mandatory=$true)][int]$Y0,
  [Parameter(Mandatory=$true)][int]$X1,
  [Parameter(Mandatory=$true)][int]$Y1,
  [string]$Label = ''
)
Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile($Png)
$rect = New-Object System.Drawing.Rectangle($X0, $Y0, ($X1 - $X0), ($Y1 - $Y0))
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$stride = [Math]::Abs($data.Stride)
$bytes = New-Object byte[] ($stride * $rect.Height)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$bmp.UnlockBits($data)

$w = $rect.Width; $h = $rect.Height
$counts = @{}
$sumR = 0; $sumG = 0; $sumB = 0; $n = 0; $redN = 0
for ($y = 0; $y -lt $h; $y++) {
  for ($x = 0; $x -lt $w; $x++) {
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
$bmp.Dispose()

$avgR = [int]($sumR / $n); $avgG = [int]($sumG / $n); $avgB = [int]($sumB / $n)
$line = "$Label | ${w}x${h} | avg=($avgR,$avgG,$avgB) | redPct=$([math]::Round($redN / $n * 100, 1))"
if ($redN -gt 0) {
  $rAvg = 0; $gAvg = 0; $bAvg = 0
  foreach ($kv in $counts.GetEnumerator()) {
    $parts = $kv.Key -split ','
    $rAvg += [int]$parts[0] * $kv.Value
    $gAvg += [int]$parts[1] * $kv.Value
    $bAvg += [int]$parts[2] * $kv.Value
  }
  $line += " | redAvgBucket=($([int]($rAvg / $redN)),$([int]($gAvg / $redN)),$([int]($bAvg / $redN)))"
}
$line
$counts.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 6 | ForEach-Object {
  "    bucket $($_.Key)  n=$($_.Value)  pct=$([math]::Round($_.Value / $n * 100, 1))%"
}
