# -*- coding: utf-8 -*-
"""Septette (ZUN) 结构与拍号复核：长音落点 + 每 4 小节块的和弦根音/旋律数量。"""
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
mel = chans[3]['notes']
print('长音落点检验（旋律中 d>=1.2 拍的音，共 %d）' % len([n for n in mel if n['d'] >= 1.2 * beat]))
for meter in (3, 4):
    bar = beat * meter
    conc = 0.0; cnt = 0
    for n in mel:
        if n['d'] < 1.2 * beat:
            continue
        ph = (n['t'] % bar) / bar
        conc += max(0.0, 1.0 - min(ph, 1 - ph) * 6)
        cnt += 1
    print('   %d 拍/小节：集中度 %.3f（%d 音）' % (meter, conc / cnt, cnt))

# 3/4 网格下的结构图
bar = beat * 3
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
bass = chans[13]['notes']
def root_at(t):
    cand = [n for n in bass if n['t'] - 0.03 <= t < n['t'] + n['d']]
    return min(cand, key=lambda n: n['m']) if cand else None
print('\n每 4 小节块（3/4）：旋律音数 / 最低音 / 最高音 / 根音')
t = 2.45
i = 0
while t < 134.5:
    t1 = t + bar * 4
    seg = [n for n in mel if t <= n['t'] < t1]
    r = root_at(t + 0.02)
    ms = [n['m'] for n in seg]
    print('  块%2d %6.2f–%6.2fs 旋律%3d 音域%s 根音%s' % (
        i, t, t1, len(seg),
        ('%d–%d' % (min(ms), max(ms))) if ms else '—',
        NAMES[r['m'] % 12] + str(r['m'] // 12) if r else '—'))
    t = t1
    i += 1
