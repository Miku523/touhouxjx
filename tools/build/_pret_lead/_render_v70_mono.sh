#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/../../.."
mkdir -p tools/build/_pret_kit
python tools/build/_exsr_render.py --file src/engine/songs/pre1.js --export HONOU_PRE1 --key pre1 --out tools/build/_pret_kit/pre1_v70_mono.wav --stems tools/build/_pret_lead/stems_pre1_v70 --json tools/build/_pret_kit/pre1_v70.json --kick-body 1.8 > tools/build/_pret_kit/pre1_v70.log 2>&1
echo "pre1 done"
python tools/build/_exsr_render.py --file src/engine/songs/pre2.js --export GENSHI_PRE2 --key pre2 --out tools/build/_pret_kit/pre2_v70_mono.wav --stems tools/build/_pret_lead/stems_pre2_v70 --json tools/build/_pret_kit/pre2_v70.json --kick-body 1.5 > tools/build/_pret_kit/pre2_v70.log 2>&1
echo "pre2 done"
python tools/build/_exsr_render.py --file src/engine/songs/pre3.js --export LUNATE_PRE3 --key pre3 --out tools/build/_pret_kit/pre3_v70_mono.wav --stems tools/build/_pret_lead/stems_pre3_v70 --json tools/build/_pret_kit/pre3_v70.json --kick-body 1.5 > tools/build/_pret_kit/pre3_v70.log 2>&1
echo "pre3 done"
python tools/build/_exsr_render.py --file src/engine/songs/pre4.js --export FALL_PRE4 --key pre4 --out tools/build/_pret_kit/pre4_v70_mono.wav --stems tools/build/_pret_lead/stems_pre4_v70 --json tools/build/_pret_kit/pre4_v70.json --kick-body 1.3 > tools/build/_pret_kit/pre4_v70.log 2>&1
echo "pre4 done"
python tools/build/_exsr_render.py --file src/engine/songs/pre6.js --export VOYAGE_PRE6 --key pre6 --out tools/build/_pret_kit/pre6_v70_mono.wav --stems tools/build/_pret_lead/stems_pre6_v70 --json tools/build/_pret_kit/pre6_v70.json --kick-body 1.6 > tools/build/_pret_kit/pre6_v70.log 2>&1
echo "pre6 done"
echo ALLDONE
