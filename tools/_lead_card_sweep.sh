#!/usr/bin/env bash
# 每个 Boss 单独从 Boss 场开局打一遍，采集「符卡切换」事件，核对 38 张卡都能进能出。
set -u
cd "$(dirname "$0")/.."
mkdir -p _pt/lead_cards
URL=http://127.0.0.1:8138/index.html
run() { # stage startX port tag steps
  echo "=== $4 stage $1 startX $2 ==="
  node tools/_sim_player.mjs --stage "$1" --diff N --god 1 --maxSteps "$5" \
    --startX "$2" --port "$3" --url "$URL" --out "_pt/lead_cards/$4.json" 2>&1 | tail -2
}
run 0 17600 9491 s1 30000
run 1 22560 9492 s2 30000
run 2 26272 9493 s3 30000
run 3 14304 9494 s4 35000
run 4 35840 9495 s5 35000
run 5 40768 9496 s6 45000
echo "=== extra ==="
node tools/_sim_player.mjs --extra 1 --diff N --god 1 --maxSteps 45000 \
  --port 9497 --url "$URL" --out _pt/lead_cards/extra.json 2>&1 | tail -2
echo "=== done ==="
