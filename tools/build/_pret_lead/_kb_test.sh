#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/../../.."
python tools/build/_exsr_render.py --file src/engine/songs/pre1.js --export HONOU_PRE1 --key pre1 --out tools/build/_pret_kit/pre1_kb26.wav --json tools/build/_pret_kit/pre1_kb26.json --kick-body 2.6 > tools/build/_pret_kit/pre1_kb26.log 2>&1
echo p1
python tools/build/_exsr_render.py --file src/engine/songs/pre4.js --export FALL_PRE4 --key pre4 --out tools/build/_pret_kit/pre4_kb22.wav --json tools/build/_pret_kit/pre4_kb22.json --kick-body 2.2 > tools/build/_pret_kit/pre4_kb22.log 2>&1
echo p4
