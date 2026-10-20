# Draws the placeholder TappedIn icon (electron/tappedin.ico) to match BrandGlyph in src/ui/icons.tsx:
# a white signal (dot + two waves) on a cyan-to-violet rounded tile. Replace the .ico with the real logo
# when it's ready; this script is only for the placeholder. Windows PowerShell 5.1.
Add-Type -AssemblyName System.Drawing
$out = Join-Path (Split-Path -Parent $PSScriptRoot) 'electron\tappedin.ico'

function New-IconPng([int]$S) {
    $bmp = New-Object System.Drawing.Bitmap $S, $S
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $r = [single]($S * 0.22)
    $tile = New-Object System.Drawing.Drawing2D.GraphicsPath
    $tile.AddArc(0, 0, 2 * $r, 2 * $r, 180, 90); $tile.AddArc($S - 2 * $r, 0, 2 * $r, 2 * $r, 270, 90)
    $tile.AddArc($S - 2 * $r, $S - 2 * $r, 2 * $r, 2 * $r, 0, 90); $tile.AddArc(0, $S - 2 * $r, 2 * $r, 2 * $r, 90, 90)
    $tile.CloseFigure()
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.Point]::new(0, 0)), ([System.Drawing.Point]::new($S, $S)), ([System.Drawing.Color]::Black), ([System.Drawing.Color]::Black)
    $blend = New-Object System.Drawing.Drawing2D.ColorBlend 3
    $blend.Colors = @([System.Drawing.ColorTranslator]::FromHtml('#22d3ee'), [System.Drawing.ColorTranslator]::FromHtml('#6b6bff'), [System.Drawing.ColorTranslator]::FromHtml('#8b5cf6'))
    $blend.Positions = @([single]0, [single]0.55, [single]1)
    $brush.InterpolationColors = $blend
    $g.FillPath($brush, $tile)
    # Glyph on a 24-unit grid, 70% of the tile, centered (same numbers as BrandGlyph).
    $k = $S * 0.7 / 24; $o = $S * 0.15
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([single](2.6 * $k))
    $pen.StartCap = 'Round'; $pen.EndCap = 'Round'
    $cx = $o + 7 * $k; $cy = $o + 17 * $k
    foreach ($rad in 6.5, 12) { $a = $rad * $k; $g.DrawArc($pen, [single]($cx - $a), [single]($cy - $a), [single](2 * $a), [single](2 * $a), 270, 90) }
    $d = 2.2 * $k; $g.FillEllipse([System.Drawing.Brushes]::White, [single]($cx - $d), [single]($cy - $d), [single](2 * $d), [single](2 * $d))
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    return , $ms.ToArray()
}

# ICO = header + one directory entry per size + the PNG bytes (PNG-in-ICO, Windows Vista and later).
$sizes = 16, 24, 32, 48, 64, 256
$pngs = @($sizes | ForEach-Object { , (New-IconPng $_) })
$fs = [System.IO.File]::Create($out)
$w = New-Object System.IO.BinaryWriter $fs
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i] % 256  # 0 means 256
    $w.Write([byte]$s); $w.Write([byte]$s); $w.Write([byte]0); $w.Write([byte]0)
    $w.Write([uint16]1); $w.Write([uint16]32); $w.Write([uint32]$pngs[$i].Length); $w.Write([uint32]$offset)
    $offset += $pngs[$i].Length
}
foreach ($p in $pngs) { $w.Write($p) }
$w.Close()
Write-Host "Wrote $out"
