# -*- coding: utf-8 -*-
"""用鼓的底鼓/军鼓还原拍号：统计底鼓落在 3 拍 vs 4 拍网格的第几拍。"""
import os, sys, collections
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M

MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '6 - The Embodiment of Scarlet Devil', '13. Septette for a Dead Princess (ZUN).mid')
midi = M.parse_midi(MID)
chans, segs, div = M.extract_channels(midi)
beat = 60.0 / 145.0
dr = chans[9]['notes']
pit = collections.Counter(n['m'] for n in dr)
print('鼓音高分布：', dict(pit.most_common()))

kick = [n['t'] for n in dr if n['m'] in (35, 36)]
snare = [n['t'] for n in dr if n['m'] in (38, 40)]
print('底鼓 %d 击 / 军鼓 %d 击' % (len(kick), len(snare)))

for meter in (3, 4):
    bar = beat * meter
    hk = collections.Counter()
    for t in kick:
        ph = (t % bar) / bar
        hk['%.2f' % ph] += 1
    # 底鼓在「第 1 拍」的比例
    first = sum(c for k, c in hk.items() if float(k) < 0.12 or float(k) > 0.88)
    print('%d 拍/小节：底鼓落第 1 拍 %d/%d = %.0f%%' % (meter, first, len(kick), 100.0 * first / max(1, len(kick))))
    top = ' '.join('%s:%d' % (k, c) for k, c in sorted(hk.items(), key=lambda x: -x[1])[:8])
    print('   分布', top)

# 更直接：底鼓间隔直方
gaps = collections.Counter()
for a, b in zip(kick, kick[1:]):
    if b - a < 6:
        gaps['%.2f' % (round((b - a) / (beat / 2)) * (beat / 2))] += 1
print('底鼓间隔（按 8 分取整, beat=%.3fs）:' % beat, dict(gaps.most_common(8)))
