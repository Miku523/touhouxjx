set -e
cd "$(dirname "$0")/../../.."
for n in pre1 pre2 pre3 pre4 pre6; do
  echo "=== mp3 $n"
  python tools/optimize_audio_mp3.py --only $n --force --mode cbr --bitrate 192 2>&1 | tail -3
done
ls -la src/assets/bgm/pre*.mp3 | awk '{print $5, $9}'
echo MP3DONE