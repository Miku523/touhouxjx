set -e
cd "$(dirname "$0")/../../.."
for spec in "pre1 HONOU_PRE1" "pre3 LUNATE_PRE3" "pre4 FALL_PRE4"; do
  set -- $spec
  N=$1; E=$2
  echo "=== mono $N ==="
  python tools/build/_exsr_render.py --file src/engine/songs/$N.js --export $E --key $N \
    --out tools/build/_pret_kit/${N}_v3_mono.wav --stems tools/build/_pret_lead/stems_${N}_v3 \
    --json tools/build/_pret_kit/${N}_v3.json 2>&1 | tail -4
done
echo MONODONE