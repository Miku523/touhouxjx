# -*- coding: utf-8 -*-
"""判断 Septette (ZUN) 的拍号与主旋律通道。"""
import os, sys, collections
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M

MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '6 - The Embodiment of Scarlet Devil', '13. Septette for a Dead Princess (ZUN).mid')
midi = M.parse_midi(MID)
chans, segs, div = M.extract_channels(midi)
print('BPM', M.bpm_of(segs), '| div', div, '| tempo 段', len(segs))
print('tempo map:')
for tk, sec, uspq in segs:
    print('   tick %6d  %8.3fs  %.2f BPM' % (tk, sec, 60e6 / uspq))

ch = {k: v['notes'] for k, v in chans.items()}
print('progs:', {k: dict(v['progs']) for k, v in chans.items() if v['progs']})

# 拍号判定：用主旋律/贝斯音头在 3 拍 vs 4 拍网格上的对齐强度
beat = 60.0 / 145.0
for name, src in (('全部', [n for ns in ch.values() for n in ns]),):
    for meter in (3, 4):
        bar = beat * meter
        score = 0.0
        for n in src:
            ph = (n['t'] % bar) / bar
            score += max(0.0, 1.0 - min(ph, 1 - ph) * 8) * n['d']
        print('%s 网格：%d 拍/小节 -> 小节头权重 %.2f' % (name, meter, score))

# 逐通道：音头落在哪一拍
print('\n逐通道拍位分布（拍 = %.4fs）' % beat)
for k in sorted(ch):
    ns = ch[k]
    h = collections.Counter()
    for n in ns:
        h[round((n['t'] / beat) % 4, 1)] += 1
    print(' ch%-2d' % k, dict(sorted(h.items())))
