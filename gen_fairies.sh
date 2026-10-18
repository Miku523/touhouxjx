#!/usr/bin/env bash
# 按 enemies.js 里 FAIRY_COLORS 的五色设定，逐色生成 AI 妖精
set -u
cd "$(dirname "$0")" || exit 1
K='ARK_API_KEY'
API='https://ark.cn-beijing.volces.com/api/v3/images/generations'
MODEL='doubao-seedream-5-0-pro-260628'
OUT=src/art/gen/fairy
mkdir -p "$OUT"

gen() {
  local key="$1" desc="$2"
  if [ -f "$OUT/$key.png" ]; then echo "skip $key"; return 0; fi
  local prompt="chibi anime fairy girl, tiny body, two pairs of translucent butterfly wings, ${desc}, floating in midair, cute, retro doujin game art, thick hand-drawn black outlines, flat cel shading, pure white background, no text"
  local resp url
  resp=$(curl -s -m 180 -X POST "$API" \
    -H "Authorization: Bearer $K" -H "Content-Type: application/json" \
    -d "{\"model\":\"$MODEL\",\"prompt\":$(python -c "import json,sys;print(json.dumps(sys.argv[1]))" "$prompt"),\"size\":\"1024x1024\",\"response_format\":\"url\"}")
  url=$(echo "$resp" | python -c "import sys,json
try:
    print(json.load(sys.stdin).get('data',[{}])[0].get('url',''))
except Exception:
    print('')" 2>/dev/null)
  if [ -z "$url" ]; then echo "FAIL $key"; return 1; fi
  curl -s -m 60 "$url" -o "_f_$key" 
  python - <<PY
from PIL import Image
Image.open("_f_$key").convert("RGB").save("_f_$key.jpg", quality=93)
PY
  python cutout.py "_f_$key.jpg" "$OUT/$key.png" 170 243 >/dev/null 2>&1
  rm -f "_f_$key" "_f_$key.jpg"
  echo "OK $key $(stat -c%s "$OUT/$key.png" 2>/dev/null)"
}

gen blue   "short deep blue hair, white and sky blue dress, luminous blue wings"
gen red    "short crimson hair, white and crimson red dress, luminous pink red wings"
gen green  "short emerald green hair, white and green dress, luminous emerald wings"
gen yellow "short amber yellow hair, white and golden dress, luminous golden wings"
gen purple "short violet purple hair, white and lavender dress, luminous purple wings"
