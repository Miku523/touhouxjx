#!/bin/bash
set -u
URL=http://127.0.0.1:8138/index.html
node tools/_sim_player.mjs --stage 0 --diff N --god 1 --maxSteps 30000 --startX 17800 --port 9470 --url "$URL" --out _pt/lead_boss/s1.json > _pt/lead_boss/s1.log 2>&1
node tools/_sim_player.mjs --stage 1 --diff N --god 1 --maxSteps 40000 --startX 22760 --port 9471 --url "$URL" --out _pt/lead_boss/s2.json > _pt/lead_boss/s2.log 2>&1
node tools/_sim_player.mjs --stage 2 --diff N --god 1 --maxSteps 50000 --startX 26472 --port 9472 --url "$URL" --out _pt/lead_boss/s3.json > _pt/lead_boss/s3.log 2>&1
echo DONE
