<#
.SYNOPSIS
  Turn a video into the frame sets a landing page scrubs through.

.EXAMPLE
  ./tools/extract-frames.ps1 -Video D:\clips\hermes.mp4 -Slug hermes -Bg "#07080b"
  ./tools/extract-frames.ps1 -Video wide.mp4 -MobileVideo tall.mp4 -Slug paul
  ./tools/extract-frames.ps1 -Video hermes.mp4 -Slug hermes -Format avif -Crf 32 -DesktopWidth 1920

.NOTES
  Writes <slug>/frames/desktop/0001.webp (or .avif) …, <slug>/frames/mobile/…,
  poster.webp and manifest.json. AVIF is about a third smaller than WebP at the
  same quality, so it allows full-width frames within the size budget. Without -MobileVideo the mobile set is a centre 9:16 crop
  of the main video. Needs ffmpeg and ffprobe on PATH.
#>
param(
  [Parameter(Mandatory = $true)] [string]$Video,
  [Parameter(Mandatory = $true)] [string]$Slug,
  [string]$MobileVideo,
  [int]$DesktopCount = 150,
  [int]$MobileCount = 90,
  [int]$DesktopWidth = 1600,
  [int]$MobileWidth = 720,
  [int]$Quality = 74,
  [ValidateSet("webp", "avif")] [string]$Format = "webp",
  [int]$Crf = 32,
  [string]$Bg = "#000000",
  [double]$PosterAt = 1.0
)

$ErrorActionPreference = "Stop"
$inv = [System.Globalization.CultureInfo]::InvariantCulture
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "$Slug/frames"

function Get-Duration([string]$path) {
  $d = & ffprobe -v error -show_entries format=duration -of csv=p=0 $path
  return [double]::Parse($d.Trim(), $inv)
}

function Export-Set([string]$src, [string]$name, [int]$count, [string]$filter) {
  $dir = Join-Path $out $name
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Get-ChildItem $dir -Include *.webp, *.avif -Recurse | Remove-Item -Force
  $fps = [string]::Format($inv, "{0:0.#####}", $count / (Get-Duration $src))
  if ($Format -eq "avif") {
    # ffmpeg's image2 muxer writes AVIF files browsers cannot decode, so go through PNG
    # and encode each frame as its own single-image AVIF.
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) "frames-$Slug-$name"
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    Get-ChildItem $tmp -Filter *.png | Remove-Item -Force
    & ffmpeg -v error -y -i $src -vf "fps=$fps,$filter" -frames:v $count (Join-Path $tmp "%04d.png")
    if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed for $name" }
    foreach ($png in Get-ChildItem $tmp -Filter *.png) {
      & ffmpeg -v error -y -i $png.FullName -c:v libaom-av1 -still-picture 1 -crf $Crf -cpu-used 6 -row-mt 1 -pix_fmt yuv420p -f avif (Join-Path $dir ($png.BaseName + ".avif"))
      if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed for $($png.Name)" }
    }
    Remove-Item $tmp -Recurse -Force
  } else {
    & ffmpeg -v error -y -i $src -vf "fps=$fps,$filter" -frames:v $count -c:v libwebp -quality $Quality (Join-Path $dir "%04d.webp")
  }
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed for $name" }
  $files = Get-ChildItem $dir -Filter "*.$Format" | Sort-Object Name
  $size = & ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 $files[0].FullName
  $w, $h = $size.Trim().Split(",")
  $kb = [math]::Round(($files | Measure-Object Length -Sum).Sum / 1KB)
  Write-Host "$name : $($files.Count) frames, ${w}x$h, $kb KB"
  return [ordered]@{ count = $files.Count; width = [int]$w; height = [int]$h }
}

$desktop = Export-Set $Video "desktop" $DesktopCount "scale=${DesktopWidth}:-2"
if ($MobileVideo) {
  $mobile = Export-Set $MobileVideo "mobile" $MobileCount "scale=${MobileWidth}:-2"
} else {
  $mobile = Export-Set $Video "mobile" $MobileCount "crop=ih*9/16:ih,scale=${MobileWidth}:-2"
}

# The poster is always WebP: the portfolio cards and the reduced-motion view load it as a plain <img>.
$posterIndex = [math]::Max(1, [math]::Round($desktop.count * $PosterAt))
$posterSrc = Join-Path $out ("desktop/{0:D4}.$Format" -f $posterIndex)
if ($Format -eq "webp") {
  Copy-Item $posterSrc (Join-Path $out "poster.webp") -Force
} else {
  & ffmpeg -v error -y -i $posterSrc -c:v libwebp -quality 80 (Join-Path $out "poster.webp")
}

$version = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$manifest = [ordered]@{ bg = $Bg; source = (Split-Path -Leaf $Video); version = $version; ext = $Format; desktop = $desktop; mobile = $mobile }
$manifest | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $out "manifest.json")
Write-Host "manifest -> $out/manifest.json"
