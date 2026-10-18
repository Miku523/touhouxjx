#!/usr/bin/env bash
# 批量生成 7 位 Boss 的战斗立绘（透明 PNG，脚底/中心对齐）
set -u
cd "$(dirname "$0")" || exit 1
K='ARK_API_KEY'
API='https://ark.cn-beijing.volces.com/api/v3/images/generations'
MODEL='doubao-seedream-5-0-pro-260628'
STYLE='chibi anime girl full body, floating in midair, arms slightly spread wide, retro doujin game art, thick hand-drawn black outlines, flat cel shading, pure white background, no text'
OUT=src/art/gen/boss
mkdir -p "$OUT"

gen() {
  local key="$1" desc="$2"
  if [ -f "$OUT/$key.png" ]; then echo "skip $key"; return 0; fi
  local prompt="$STYLE, $desc"
  local resp url
  resp=$(curl -s -m 180 -X POST "$API" \
    -H "Authorization: Bearer $K" -H "Content-Type: application/json" \
    -d "{\"model\":\"$MODEL\",\"prompt\":$(python -c "import json,sys;print(json.dumps(sys.argv[1]))" "$prompt"),\"size\":\"1024x1536\",\"response_format\":\"url\"}")
  url=$(echo "$resp" | python -c "import sys,json
try:
    d=json.load(sys.stdin)
    print(d.get('data',[{}])[0].get('url',''))
except Exception:
    print('')" 2>/dev/null)
  if [ -z "$url" ]; then
    echo "FAIL $key: $(echo "$resp" | head -c 160)"
    return 1
  fi
  curl -s -m 60 "$url" -o "_tmp_$key.jpg"
  python cutout.py "_tmp_$key.jpg" "$OUT/$key.png" 560 243 >/dev/null 2>&1
  rm -f "_tmp_$key.jpg"
  echo "OK $key $(stat -c%s "$OUT/$key.png" 2>/dev/null)"
}

gen wriggle "short light green hair, green and black dress, translucent insect wings, two antennae on head"
gen cirno "short pale blue hair with a blue ribbon, white and blue dress, translucent ice crystal wings"
gen aya "short black hair, red toque hat with pom-pom, red and white tengu outfit, holding a feather fan"
gen yuyuko "long pink hair, pale blue and white kimono with butterfly pattern, holding a folding fan, serene smile"
gen kaguya "very long black hair, pale pink and purple layered kimono, princess headdress, elegant"
gen flandre "blonde hair in a side ponytail with a red ribbon, red and white dress, large translucent crystal wings, wide grin"
