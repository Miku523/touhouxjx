#!/usr/bin/env bash
# 主线 6 Boss + Extra 逐个「从 Boss 场开局」打穿，检查每张符卡可进入、可结束、Boss 可击破。
set -u
cd "$(dirname "$0")/.."
mkdir -p _pt/lead_boss_sweep
URL=http://127.0.0.1:8138/index.html
run() { # stage startX port tag
  echo "=== stage $1 startX $2 port $3 ==="
  node tools/_sim_player.mjs --stage "$1" --diff N --god 1 --maxSteps 60000 \
    --startX "$2" --port "$3" --url "$URL" --out "_pt/lead_boss_sweep/$4.json" 2>&1 | tail -3
}
run 0 17600 9491 s1
run 1 22560 9492 s2
run 2 26272 9493 s3
run 3 14304 9494 s4
run 4 35840 9495 s5
run 5 40768 9496 s6
echo "=== extra ==="
node tools/_sim_player.mjs --extra 1 --diff N --god 1 --maxSteps 60000 \
  --port 9497 --url "$URL" --out _pt/lead_boss_sweep/extra.json 2>&1 | tail -3
echo "=== done ==="
