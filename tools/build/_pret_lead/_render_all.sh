set -e
cd "$(dirname "$0")/../../.."
for spec in "pre1 HONOU_PRE1" "pre2 GENSHI_PRE2" "pre3 LUNATE_PRE3" "pre4 FALL_PRE4" "pre6 VOYAGE_PRE6"; do
  set -- $spec
  N=$1; E=$2
  echo "=== render $N ==="
  python tools/build/_exsr_render.py --file src/engine/songs/$N.js --export $E --key $N \
    --out tools/build/_pret_kit/${N}_v1_mono.wav --stems tools/build/_pret_lead/stems_${N}_v1 \
    --json tools/build/_pret_kit/${N}_v1.json 2>&1 | tail -6
done
echo ALLDONE