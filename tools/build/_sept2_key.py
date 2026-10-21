# -*- coding: utf-8 -*-
"""用 MIDI 里各声部的音级分布定调（排除鼓通道）"""
import os, sys, numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '6 - The Embodiment of Scarlet Devil', '13. Septette for a Dead Princess (ZUN).mid')
chans, segs, div = M.extract_channels(M.parse_midi(MID))
def hist(ch, weight='dur'):
    h = np.zeros(12)
    for n in chans[ch]['notes']:
        h[n['m'] % 12] += n['d'] if weight == 'dur' else 1.0
    return h / (h.sum() + 1e-9)
def show(tag, h):
    order = np.argsort(-h)
    print(tag, ' '.join('%s%.2f' % (NAMES[i], h[i]) for i in order if h[i] > 0.04))
for ch in (3, 10, 2, 1, 13):
    show('ch%-2d' % ch, hist(ch))
# 旋律每 8 拍局部主音（按第一个音/最低音）
lead = sorted(chans[3]['notes'], key=lambda n: n['t'])
print('lead 前 40 音:', [NAMES[n['m']%12] for n in lead[:40]])
print('lead 音域', min(n['m'] for n in lead), max(n['m'] for n in lead))
# 低音：每小节第一个音
b = sorted(chans[1]['notes'], key=lambda n: n['t'])
print('ch1 前 24 音:', [(round(n['t'],2), NAMES[n['m']%12]) for n in b[:24]])
