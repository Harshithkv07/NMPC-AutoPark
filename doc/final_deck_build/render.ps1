# Review helper: exports every slide of the built deck to PNG through PowerPoint itself (the real renderer).
#   pwsh render.ps1 <out dir>
# Leaves any PowerPoint window that was already open alone.
param([Parameter(Mandatory = $true)][string]$Out)
$deck = (Resolve-Path "$PSScriptRoot\..\Robotics_Final_Group_B9.pptx").Path
New-Item -ItemType Directory -Force $Out | Out-Null
Get-ChildItem $Out -Filter "s*.png" | Remove-Item -Confirm:$false
$wasRunning = [bool](Get-Process POWERPNT -ErrorAction SilentlyContinue)
$app = New-Object -ComObject PowerPoint.Application
$p = $app.Presentations.Open($deck, $true, $false, $false)
$i = 1
foreach ($s in $p.Slides) { $s.Export(("{0}\s{1:D2}.png" -f (Resolve-Path $Out).Path, $i), "PNG", 1600, 900); $i++ }
$p.Close()
if (-not $wasRunning) { $app.Quit() }
"exported $($i - 1) slides"
