set -e
cd "$(dirname "$0")/../../.."
render() {
  N=$1; E=$2; shift 2
  echo "=== stereo $N ==="
  python tools/build/_exsr_render.py --file src/engine/songs/$N.js --export $E --key $N --stereo \
    --out tools/build/_pret_kit/${N}_stereo_raw.wav --json tools/build/_pret_kit/${N}_stereo.json "$@" 2>&1 | tail -5
}
render pre1 HONOU_PRE1 --section-gain 0:3.31:1.5 --section-gain 62.897:76.138:-1.5 --section-gain 76.138:82.759:0.5
render pre2 GENSHI_PRE2 --section-gain 0:6.358:1.0
render pre3 LUNATE_PRE3 --section-gain 3.357:16.783:0.8 --section-gain 57.063:63.776:-0.5 --section-gain 90.629:93.986:-1.0
render pre4 FALL_PRE4 --section-gain 23.558:47.117:-2.0 --section-gain 79.509:103.067:-2.0 --section-gain 103.067:120.736:0.5
render pre6 VOYAGE_PRE6 --section-gain 0:2.963:0.8 --section-gain 80.0:82.963:-0.5
echo STEREODONE