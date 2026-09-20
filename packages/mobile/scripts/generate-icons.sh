#!/usr/bin/env bash
# Render the Lumen Apeiron launcher icons and splash images for the Capacitor shell.
#
# Every PNG comes from one mark-only source, assets/icon-mark.svg: the favicon's arc
# band and ember pills on a transparent 64-unit viewBox. For each output the script
# composes an SVG at the output's pixel size (an optional background shape, then the
# mark, placed by a transform so its circumscribed circle is D px across and centred
# on the canvas) and rasterises it with rsvg-convert at exactly that size. Nothing is
# downscaled from a bigger bitmap. ImageMagick then flattens the opaque outputs and
# rewrites every file without metadata, so a re-run produces byte-identical files.
#
#   Output (D = diameter of the mark's circumscribed circle)              D / canvas
#   ios      AppIcon.appiconset/AppIcon-512@2x.png  1024, full bleed, no alpha    0.72
#   ios      Splash.imageset: each PNG in Contents.json, no alpha       0.13 of short side
#   android  mipmap-*/ic_launcher_foreground.png  108dp adaptive layer, clear   56/108
#   android  mipmap-*/ic_launcher_monochrome.png  same, white (themed icons)    56/108
#   android  mipmap-*/ic_launcher.png             the favicon tile, rx 15/64    49.7/64
#   android  mipmap-*/ic_launcher_round.png       background circle             0.78
#   android  drawable*/splash.png at its current size, no alpha         0.28 of short side
#
# BG also lives in two Android resources that this script checks but does not write:
# res/values/ic_launcher_background.xml and lumen_background in res/values/colors.xml.
#
# Usage: pnpm --filter @chaos-master/mobile icons   (needs rsvg-convert, magick, python3)
set -euo pipefail
export LC_ALL=C

here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
pkg=$(dirname -- "$here")
mark_svg=$pkg/assets/icon-mark.svg
res=$pkg/android/app/src/main/res
xcassets=$pkg/ios/App/App/Assets.xcassets

BG='#080A0E'

# The mark in icon-mark.svg units: its centre and circumscribed radius (the arc's
# outer edge is at 24.76, the leftmost ember at 24.81).
MARK_CX=32
MARK_CY=32
MARK_R=24.85

# D / canvas per output family (awk expressions). The adaptive layer is 108dp with a
# 66dp safe-zone circle, so ADAPTIVE_D must stay at or under 66/108.
IOS_ICON_D=0.72
IOS_SPLASH_D=0.13
ADAPTIVE_D=56/108
LEGACY_TILE_D=2*$MARK_R/64
LEGACY_ROUND_D=0.78
ANDROID_SPLASH_D=0.28

# No ancillary chunks (no timestamps, so re-runs are byte-identical), 8-bit, zlib level 9.
# With png:compression-filter=1, ImageMagick 7.1 writes every row unfiltered, about 20%
# smaller than its default adaptive filtering for these flat two-ink images.
PNG_OPTS=(-strip -depth 8 -define png:compression-level=9 -define png:compression-filter=1)

die() {
  printf 'generate-icons: %s\n' "$*" >&2
  exit 1
}

warn() {
  printf 'generate-icons: warning: %s\n' "$*" >&2
}

# calc EXPR: evaluate an awk arithmetic expression, at most 6 decimals, no trailing zeros.
calc() {
  awk "BEGIN { s = sprintf(\"%.6f\", $1); sub(/\\.?0+\$/, \"\", s); print s }"
}

for tool in rsvg-convert magick python3; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool is not installed"
done
[[ -f $mark_svg ]] || die "missing $mark_svg"
awk "BEGIN { exit !($ADAPTIVE_D <= 66/108) }" || die 'ADAPTIVE_D would leave the 66dp safe zone'

work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT

# mark_body brand|white: the drawing elements inside icon-mark.svg's root, comments
# dropped. "white" rewrites every fill and stroke colour except "none" to #FFFFFF.
mark_body() {
  python3 - "$mark_svg" "$1" <<'PY'
import re
import sys

path, ink = sys.argv[1], sys.argv[2]
src = re.sub(r'<!--.*?-->', '', open(path, encoding='utf-8').read(), flags=re.S)
m = re.search(r'<svg\b([^>]*)>(.*)</svg>', src, flags=re.S)
if not m:
    sys.exit(f'{path}: no <svg> root element')
if 'viewBox="0 0 64 64"' not in m.group(1):
    sys.exit(f'{path}: expected viewBox="0 0 64 64"')
body = m.group(2)
if ink == 'white':
    if re.search(r'style="[^"]*\b(fill|stroke)\s*:', body):
        sys.exit(f'{path}: set colours with fill/stroke attributes, not style')
    body = re.sub(r'\b(fill|stroke)="(?!none")[^"]*"', r'\1="#FFFFFF"', body)
print('\n'.join(line for line in body.splitlines() if line.strip()))
PY
}
mark_brand=$(mark_body brand)
mark_white=$(mark_body white)

# compose W H BACKGROUND D INK: an SVG of W x H px holding the mark with its
# circumscribed circle D px across, centred. BACKGROUND is none, square (full bleed),
# tile (the favicon's rounded square) or circle. INK is brand or white.
compose() {
  local w=$1 h=$2 bg=$3 d=$4 ink=$5 shape body
  case $bg in
    none) shape='' ;;
    square) shape="<rect width=\"$w\" height=\"$h\" fill=\"$BG\"/>" ;;
    tile) shape="<rect width=\"$w\" height=\"$h\" rx=\"$(calc "$w*15/64")\" fill=\"$BG\"/>" ;;
    circle) shape="<circle cx=\"$(calc "$w/2")\" cy=\"$(calc "$h/2")\" r=\"$(calc "$w/2")\" fill=\"$BG\"/>" ;;
    *) die "unknown background: $bg" ;;
  esac
  if [[ $ink == white ]]; then body=$mark_white; else body=$mark_brand; fi
  cat <<EOF
<svg xmlns="http://www.w3.org/2000/svg" width="$w" height="$h" viewBox="0 0 $w $h">
$shape
<g transform="translate($(calc "$w/2") $(calc "$h/2")) scale($(calc "$d/(2*$MARK_R)")) translate(-$MARK_CX -$MARK_CY)">
$body
</g>
</svg>
EOF
}

# emit OUT W H BACKGROUND D INK opaque|alpha: render one PNG at exactly W x H px.
emit() {
  local out=$1 w=$2 h=$3 bg=$4 d=$5 ink=$6 mode=$7 channels
  compose "$w" "$h" "$bg" "$d" "$ink" >"$work/mark.svg"
  rsvg-convert --width "$w" --height "$h" --format png --output "$work/raw.png" "$work/mark.svg"
  mkdir -p -- "$(dirname -- "$out")"
  if [[ $mode == opaque ]]; then
    magick "$work/raw.png" -background "$BG" -alpha remove -alpha off "${PNG_OPTS[@]}" "PNG24:$out"
  else
    magick "$work/raw.png" "${PNG_OPTS[@]}" "PNG32:$out"
  fi
  channels=$(magick identify -format '%[channels]' "$out")
  channels=${channels%% *}
  case $mode in
    opaque) [[ $channels == srgb ]] || die "$out: expected no alpha channel, got $channels" ;;
    *) [[ $channels == srgba ]] || die "$out: expected an alpha channel, got $channels" ;;
  esac
  printf '  %-66s %4sx%-4s %-5s D %s\n' "${out#"$pkg"/}" "$w" "$h" "$channels" "$d"
}

echo 'iOS app icon'
emit "$xcassets/AppIcon.appiconset/AppIcon-512@2x.png" 1024 1024 square "$(calc "1024*$IOS_ICON_D")" brand opaque

echo 'iOS splash'
splash_json=$xcassets/Splash.imageset/Contents.json
names=$(python3 -c '
import json, sys
for image in json.load(open(sys.argv[1]))["images"]:
    name = image.get("filename", "")
    if name.lower().endswith(".png"):
        print(name)
' "$splash_json")
[[ -n $names ]] || die "no PNG listed in $splash_json"
while IFS= read -r name; do
  out=$xcassets/Splash.imageset/$name
  size='2732 2732'
  if [[ -f $out ]]; then size=$(magick identify -format '%w %h' "$out"); fi
  read -r w h <<<"$size"
  emit "$out" "$w" "$h" square "$(calc "($w < $h ? $w : $h)*$IOS_SPLASH_D")" brand opaque
done <<<"$names"

echo 'Android adaptive layers (108dp) and legacy icons (48dp)'
for spec in mdpi:1 hdpi:1.5 xhdpi:2 xxhdpi:3 xxxhdpi:4; do
  dir=$res/mipmap-${spec%%:*}
  layer=$(calc "108*${spec#*:}")
  legacy=$(calc "48*${spec#*:}")
  emit "$dir/ic_launcher_foreground.png" "$layer" "$layer" none "$(calc "$layer*$ADAPTIVE_D")" brand alpha
  emit "$dir/ic_launcher_monochrome.png" "$layer" "$layer" none "$(calc "$layer*$ADAPTIVE_D")" white alpha
  emit "$dir/ic_launcher.png" "$legacy" "$legacy" tile "$(calc "$legacy*$LEGACY_TILE_D")" brand alpha
  emit "$dir/ic_launcher_round.png" "$legacy" "$legacy" circle "$(calc "$legacy*$LEGACY_ROUND_D")" brand alpha
done

echo 'Android splash (each at its current size)'
shopt -s nullglob
splashes=("$res"/drawable*/splash.png)
shopt -u nullglob
((${#splashes[@]})) || die "no drawable*/splash.png under $res"
for out in "${splashes[@]}"; do
  size=$(magick identify -format '%w %h' "$out")
  read -r w h <<<"$size"
  emit "$out" "$w" "$h" square "$(calc "($w < $h ? $w : $h)*$ANDROID_SPLASH_D")" brand opaque
done

# Resources this script does not write but that must agree with it.
grep -qi "name=\"ic_launcher_background\">$BG<" "$res/values/ic_launcher_background.xml" ||
  warn "ic_launcher_background in res/values/ic_launcher_background.xml is not $BG"
grep -qi "name=\"lumen_background\">$BG<" "$res/values/colors.xml" 2>/dev/null ||
  warn "lumen_background in res/values/colors.xml is not $BG"
for xml in "$res"/mipmap-anydpi-v26/ic_launcher.xml "$res"/mipmap-anydpi-v26/ic_launcher_round.xml; do
  grep -q '@mipmap/ic_launcher_monochrome' "$xml" || warn "${xml#"$pkg"/} has no monochrome layer"
done
