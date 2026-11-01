#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/../../.."
K=tools/build/_pret_kit
R=tools/build/_exsr_render.py
python $R --file src/engine/songs/pre1.js --export HONOU_PRE1 --key pre1 --stereo --kick-body 2.2 --out $K/pre1_stereo_raw.wav --json $K/pre1_stereo70.json --section-gain 3.31:23.172:0.1 --section-gain 23.172:49.655:-0.5 --section-gain 49.655:62.897:-0.7 --section-gain 62.897:76.138:-0.2 --section-gain 76.138:82.759:-0.4 --section-gain 82.759:92.69:-1.0 > $K/pre1_stereo70.log 2>&1
echo s1
python $R --file src/engine/songs/pre2.js --export GENSHI_PRE2 --key pre2 --stereo --kick-body 1.6 --out $K/pre2_stereo_raw.wav --json $K/pre2_stereo70.json --section-gain 0:6.358:1.2 --section-gain 6.358:82.649:-0.3 --section-gain 82.649:95.364:-0.2 --section-gain 95.364:108.079:0.6 > $K/pre2_stereo70.log 2>&1
echo s2
python $R --file src/engine/songs/pre3.js --export LUNATE_PRE3 --key pre3 --stereo --kick-body 1.8 --out $K/pre3_stereo_raw.wav --json $K/pre3_stereo70.json --section-gain 3.357:16.783:-0.2 --section-gain 16.783:30.21:-0.4 --section-gain 30.21:57.063:0.0 --section-gain 57.063:63.776:-0.6 --section-gain 63.776:83.916:0.5 --section-gain 83.916:90.629:-0.4 --section-gain 90.629:93.986:0.8 > $K/pre3_stereo70.log 2>&1
echo s3
python $R --file src/engine/songs/pre4.js --export FALL_PRE4 --key pre4 --stereo --kick-body 2.0 --out $K/pre4_stereo_raw.wav --json $K/pre4_stereo70.json --section-gain 2.945:23.558:0.0 --section-gain 23.558:47.117:-0.9 --section-gain 47.117:58.896:0.0 --section-gain 58.896:79.509:0.5 --section-gain 79.509:103.067:-0.6 --section-gain 103.067:120.736:2.0 --section-gain 120.736:123.681:0.4 > $K/pre4_stereo70.log 2>&1
echo s4
python $R --file src/engine/songs/pre6.js --export VOYAGE_PRE6 --key pre6 --stereo --kick-body 1.6 --out $K/pre6_stereo_raw.wav --json $K/pre6_stereo70.json --section-gain 0:2.963:1.0 --section-gain 38.519:56.296:-0.3 --section-gain 56.296:80.0:0.35 --section-gain 80.0:82.963:-0.5 > $K/pre6_stereo70.log 2>&1
echo s6
echo ALLDONE
