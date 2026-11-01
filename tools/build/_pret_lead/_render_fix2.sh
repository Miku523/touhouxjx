set -e
cd /c/Users/GuSheng/Downloads/HKS
python tools/build/_exsr_render.py --file src/engine/songs/pre2.js --export GENSHI_PRE2 --key pre2 --stereo --out tools/build/_pret_kit/pre2_stereo_raw.wav --json tools/build/_pret_kit/pre2_stereo.json --section-gain 0:6.358:1.0 > tools/build/_pret_kit/pre2_stereo.log 2>&1
python tools/build/_exsr_render.py --file src/engine/songs/pre3.js --export LUNATE_PRE3 --key pre3 --stereo --out tools/build/_pret_kit/pre3_stereo_raw.wav --json tools/build/_pret_kit/pre3_stereo.json --section-gain 3.357:16.783:0.8 57.063:63.776:-0.5 90.629:93.986:-1.0 > tools/build/_pret_kit/pre3_stereo.log 2>&1
python tools/build/_pret_lead/_master_fade.py tools/build/_pret_kit/pre2_stereo_raw.wav tools/build/_pret_kit/pre2_stereo.wav >> tools/build/_pret_kit/pre2_stereo.log 2>&1
python tools/build/_pret_lead/_master_fade.py tools/build/_pret_kit/pre3_stereo_raw.wav tools/build/_pret_kit/pre3_stereo.wav >> tools/build/_pret_kit/pre3_stereo.log 2>&1
echo RENDER_DONE
