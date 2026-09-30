#!/usr/bin/env bash
# Turn a video into the frame sets a landing page scrubs through (Linux/cloud port of extract-frames.ps1).
#
# Usage:
#   tools/extract-frames.sh --video source/desktop.mp4 [--mobile-video source/mobile.mp4] \
#     [--out frames] [--bg "#000000"] [--format avif|webp] [--crf 32] [--quality 74] \
#     [--desktop-width 1600] [--desktop-count 150] [--mobile-width 720] [--mobile-count 90] [--poster-at 1.0]
#
# Writes <out>/desktop/0001.avif (or .webp) …, <out>/mobile/…, poster.webp and manifest.json.
# Without --mobile-video the mobile set is a centre 9:16 crop of the main video.
# Needs ffmpeg (with libaom-av1 for AVIF, libwebp for WebP) and ffprobe.
set -euo pipefail

VIDEO="" MOBILE_VIDEO="" OUT="frames" BG="#000000" FORMAT="webp" CRF=32 QUALITY=74
DW=1600 DC=150 MW=720 MC=90 POSTER_AT=1.0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --video) VIDEO="$2"; shift 2 ;;
    --mobile-video) MOBILE_VIDEO="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --bg) BG="$2"; shift 2 ;;
    --format) FORMAT="$2"; shift 2 ;;
    --crf) CRF="$2"; shift 2 ;;
    --quality) QUALITY="$2"; shift 2 ;;
    --desktop-width) DW="$2"; shift 2 ;;
    --desktop-count) DC="$2"; shift 2 ;;
    --mobile-width) MW="$2"; shift 2 ;;
    --mobile-count) MC="$2"; shift 2 ;;
    --poster-at) POSTER_AT="$2"; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done
[[ -n "$VIDEO" ]] || { echo "--video is required" >&2; exit 1; }
[[ "$FORMAT" == "avif" || "$FORMAT" == "webp" ]] || { echo "--format must be avif or webp" >&2; exit 1; }

duration() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }

# export_set <src> <name> <count> <filter>; prints "count width height" on the last line.
export_set() {
  local src="$1" name="$2" count="$3" filter="$4" dir="$OUT/$2"
  mkdir -p "$dir"
  rm -f "$dir"/*.webp "$dir"/*.avif
  local fps
  fps=$(awk -v c="$count" -v d="$(duration "$src")" 'BEGIN { printf "%.5f", c / d }')
  if [[ "$FORMAT" == "avif" ]]; then
    # ffmpeg's image2 muxer writes AVIF files browsers cannot decode, so go through PNG
    # and encode each frame as its own single-image AVIF.
    local tmp; tmp=$(mktemp -d)
    ffmpeg -v error -y -i "$src" -vf "fps=$fps,$filter" -frames:v "$count" "$tmp/%04d.png"
    for png in "$tmp"/*.png; do
      ffmpeg -v error -y -i "$png" -c:v libaom-av1 -still-picture 1 -crf "$CRF" -cpu-used 6 -row-mt 1 \
        -pix_fmt yuv420p -f avif "$dir/$(basename "$png" .png).avif"
    done
    rm -rf "$tmp"
  else
    ffmpeg -v error -y -i "$src" -vf "fps=$fps,$filter" -frames:v "$count" -c:v libwebp -quality "$QUALITY" "$dir/%04d.webp"
  fi
  local files=("$dir"/*."$FORMAT")
  local size; size=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${files[0]}")
  local kb; kb=$(du -k -c "${files[@]}" | tail -1 | cut -f1)
  echo "$name : ${#files[@]} frames, ${size/,/x}, ${kb} KB" >&2
  echo "${#files[@]} ${size/,/ }"
}

read -r D_COUNT D_W D_H < <(export_set "$VIDEO" desktop "$DC" "scale=${DW}:-2" | tail -1)
if [[ -n "$MOBILE_VIDEO" ]]; then
  read -r M_COUNT M_W M_H < <(export_set "$MOBILE_VIDEO" mobile "$MC" "scale=${MW}:-2" | tail -1)
else
  read -r M_COUNT M_W M_H < <(export_set "$VIDEO" mobile "$MC" "crop=ih*9/16:ih,scale=${MW}:-2" | tail -1)
fi

# The poster is always WebP: reduced-motion views and link previews load it as a plain <img>.
POSTER_INDEX=$(awk -v c="$D_COUNT" -v p="$POSTER_AT" 'BEGIN { i = int(c * p + 0.5); print (i < 1 ? 1 : i) }')
POSTER_SRC=$(printf "%s/desktop/%04d.%s" "$OUT" "$POSTER_INDEX" "$FORMAT")
if [[ "$FORMAT" == "webp" ]]; then
  cp "$POSTER_SRC" "$OUT/poster.webp"
else
  ffmpeg -v error -y -i "$POSTER_SRC" -c:v libwebp -quality 80 "$OUT/poster.webp"
fi

# manifest.version changes on every rebuild, so browsers never mix old and new frames.
cat > "$OUT/manifest.json" <<EOF
{
  "bg": "$BG",
  "source": "$(basename "$VIDEO")",
  "version": $(date +%s),
  "ext": "$FORMAT",
  "desktop": { "count": $D_COUNT, "width": $D_W, "height": $D_H },
  "mobile": { "count": $M_COUNT, "width": $M_W, "height": $M_H }
}
EOF
echo "manifest -> $OUT/manifest.json" >&2
