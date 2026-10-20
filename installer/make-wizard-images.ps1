# Draws the installer's wizard images from the app icon (electron/tappedin.ico): the tall side image
# on the welcome and finish pages (wizard-*.png) and the small corner logo on the other pages
# (wizard-small-*.png), each in a few sizes so high-DPI screens stay sharp. Run it again after the
# icon changes and commit the PNGs. Windows PowerShell 5.1.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$dir = $PSScriptRoot
$ico = [System.IO.File]::ReadAllBytes((Join-Path (Split-Path -Parent $dir) 'electron\tappedin.ico'))
# The icon's 256 px frame is a PNG (make-placeholder-icon.ps1 writes it that way): find its directory
# entry (width byte 0 means 256) and load those bytes.
$tile = $null
for ($i = 0; $i -lt [BitConverter]::ToUInt16($ico, 4); $i++) {
    $e = 6 + 16 * $i
    if ($ico[$e] -eq 0) {
        $len = [BitConverter]::ToInt32($ico, $e + 8); $off = [BitConverter]::ToInt32($ico, $e + 12)
        $tile = New-Object System.Drawing.Bitmap (New-Object System.IO.MemoryStream (, $ico[$off..($off + $len - 1)]))
    }
}
if (-not $tile) { throw 'electron\tappedin.ico has no 256 px frame.' }
$hex = { param($c) [System.Drawing.ColorTranslator]::FromHtml($c) }

function Save([System.Drawing.Bitmap]$bmp, [string]$name) {
    $bmp.Save((Join-Path $dir $name), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Wrote installer\$name"
}

# Side image, 164:314 like Inno's: the app's dark background with a soft indigo glow, the icon, the
# wordmark and one line about what it does.
foreach ($w in 164, 246, 410) {
    $h = [int][math]::Round($w * 314 / 164)
    $k = $w / 164
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'; $g.TextRenderingHint = 'AntiAliasGridFit'
    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.Point]::new(0, 0)), ([System.Drawing.Point]::new(0, $h)), (& $hex '#171a33'), (& $hex '#06070c')
    $g.FillRectangle($bg, 0, 0, $w, $h)
    $glow = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glow.AddEllipse([single](-0.4 * $w), [single](0.05 * $h), [single](1.8 * $w), [single](0.55 * $h))
    $pb = New-Object System.Drawing.Drawing2D.PathGradientBrush $glow
    $pb.CenterColor = [System.Drawing.Color]::FromArgb(70, 107, 107, 255)
    $pb.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 107, 107, 255))
    $g.FillPath($pb, $glow)
    $s = [int](64 * $k)
    $g.DrawImage($tile, [int](($w - $s) / 2), [int](0.24 * $h), $s, $s)
    $center = New-Object System.Drawing.StringFormat
    $center.Alignment = 'Center'
    $font = New-Object System.Drawing.Font 'Segoe UI', ([single](17 * $k)), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $y = [single](0.24 * $h + $s + 12 * $k)
    # "Tapped" in white and "In" in the accent color, centered together.
    $a = $g.MeasureString('Tapped', $font, [System.Drawing.PointF]::new(0, 0), [System.Drawing.StringFormat]::GenericTypographic).Width
    $b = $g.MeasureString('In', $font, [System.Drawing.PointF]::new(0, 0), [System.Drawing.StringFormat]::GenericTypographic).Width
    $x = ($w - $a - $b) / 2
    $g.DrawString('Tapped', $font, [System.Drawing.Brushes]::White, [single]$x, $y, [System.Drawing.StringFormat]::GenericTypographic)
    $g.DrawString('In', $font, (New-Object System.Drawing.SolidBrush (& $hex '#8b8bff')), [single]($x + $a), $y, [System.Drawing.StringFormat]::GenericTypographic)
    $small = New-Object System.Drawing.Font 'Segoe UI', ([single](10 * $k)), ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
    $rect = New-Object System.Drawing.RectangleF ([single](14 * $k)), ([single]($y + 30 * $k)), ([single]($w - 28 * $k)), ([single](60 * $k))
    $g.DrawString("Every game that matters,`non the TV service you have", $small, (New-Object System.Drawing.SolidBrush (& $hex '#9aa0bd')), $rect, $center)
    $g.Dispose()
    Save $bmp "wizard-$w.png"
}

# Corner logo (Inno's small image area is 55x58 at 100%): the icon on a transparent background.
foreach ($w in 55, 83, 138) {
    $h = [int][math]::Round($w * 58 / 55)
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = 'HighQualityBicubic'
    $s = [int]($w * 0.86)
    $g.DrawImage($tile, [int](($w - $s) / 2), [int](($h - $s) / 2), $s, $s)
    $g.Dispose()
    Save $bmp "wizard-small-$w.png"
}
