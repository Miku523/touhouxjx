#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/../../.."
for n in pre1 pre2 pre3 pre4 pre6; do
  python tools/build/_pret_lead/_master_fade.py tools/build/_pret_kit/${n}_stereo_raw.wav tools/build/_pret_kit/${n}_stereo.wav
done
