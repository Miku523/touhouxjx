#!/bin/bash
set -e
cd /c/Users/GuSheng/Downloads/HKS
KIT_Y=tools/build/_youmu_kit
KIT_U=tools/build/_yuyuko_kit
# 备份 v2 成品（未提交，丢了找不回）
[ -f src/assets/bgm/youmu_pre5.mp3 ] && cp -f src/assets/bgm/youmu_pre5.mp3 $KIT_Y/youmu_pre5_v2.mp3 || true
[ -f src/assets/bgm/yuyuko_stage5.mp3 ] && cp -f src/assets/bgm/yuyuko_stage5.mp3 $KIT_U/yuyuko_stage5_v2.mp3 || true
# 母版就位 + 循环淡出
cp -f $KIT_Y/youmu_v3_raw.wav $KIT_Y/youmu_pre5_stereo.wav
cp -f $KIT_U/yuyuko_v3_raw.wav $KIT_U/yuyuko_stage5_stereo.wav
python tools/build/_yuyuko_kit/fade.py $KIT_Y/youmu_pre5_stereo.wav
python tools/build/_yuyuko_kit/fade.py $KIT_U/yuyuko_stage5_stereo.wav
# 编码 MP3
python tools/optimize_audio_mp3.py --only youmu_pre5 --mode cbr --bitrate 320 --force --json --out $KIT_Y/mp3_report_v3.json
python tools/optimize_audio_mp3.py --only yuyuko_stage5 --mode cbr --bitrate 320 --force --json --out $KIT_U/mp3_report_v3.json
ls -l src/assets/bgm/youmu_pre5.mp3 src/assets/bgm/yuyuko_stage5.mp3
