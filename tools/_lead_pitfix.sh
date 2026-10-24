#!/usr/bin/env bash
# 第 6 面坑区：当前构建下重复跑，统计「能否自行跳过 96px 无底坑」
set -u
cd "$(dirname "$0")/.."
mkdir -p _pt/lead_pitfix
for i in 1 2 3 4 5; do
  port=$((9600 + i))
  node tools/_sim_player.mjs --stage 5 --diff N --god 1 --maxSteps 7000 --startX 32000 \
    --port "$port" --url http://127.0.0.1:8138/index.html \
    --out "_pt/lead_pitfix/run$i.json" > "_pt/lead_pitfix/run$i.log" 2>&1
  echo "run$i exit=$?"
done
node -e '
const fs=require("fs");
for (let i=1;i<=5;i++){
  const p="_pt/lead_pitfix/run"+i+".json";
  if(!fs.existsSync(p)){console.log("run"+i,"NO JSON");continue;}
  const d=JSON.parse(fs.readFileSync(p,"utf8"));
  const ev=(d.events||[]).filter(e=>/death|rescue|clear|pit/i.test(e.kind||e.type||""));
  const deaths=(d.deaths!==undefined?d.deaths:(ev.filter(e=>/death/i.test(e.kind||"")).length));
  console.log("run"+i, JSON.stringify({ok:d.ok,deaths,lives:d.lives,maxX:Math.round(d.stageMaxX||d.px||0),lastStage:d.lastStage,state:d.state,gx:Math.round(d.gx||0)}));
}
'
