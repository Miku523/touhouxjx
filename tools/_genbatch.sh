set -u
cd "$(dirname "$0")/.."
python tools/gen_boss_action.py flandre --n 2 --tag a1
python tools/gen_boss_action.py aya --n 1 --tag a1
python tools/gen_boss_action.py yuyuko --n 1 --tag a1
python tools/gen_boss_action.py kaguya --n 1 --tag a1
echo BATCH_DONE
