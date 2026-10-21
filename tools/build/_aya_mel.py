# -*- coding: utf-8 -*-
"""把 ch0/ch6 的旋律量化到 16 分音符网格并打印成谱面文字，便于人工找段落。"""
import json, os, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from midi2js import parse_midi, extract_channels

MID = (r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
       r'\1 - Shooter Games\9 - Phantasmagoria of Flower View'
       r'\11. Wind God Girl (Kanade_KND34).mid')
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def nm(m): return '%s%d' % (NAMES[m%12], m//12-1)

midi = parse_midi(MID)
chans, segs, div = extract_channels(midi)
bpm = 60.0/(segs[0][2]/1e6)
step = 60.0/bpm/4          # 16 分音符秒数
bar = step*16

def q(ch):
    """-> {bar: [(step_in_bar, midi, len_steps, vel)]}"""
    out = {}
    for n in chans[ch]['notes']:
        s = round(n['t']/step)
        b, si = divmod(s, 16)
        ls = max(1, round(n['d']/step))
        out.setdefault(b, []).append((si, n['m'], ls, n['v']))
    return out

def show(ch, b0, b1, label):
    qq = q(ch)
    print('\n##### %s ch%d 小节 %d-%d #####' % (label, ch, b0, b1))
    for b in range(b0, b1):
        ns = sorted(qq.get(b, []))
        if not ns:
            print('B%03d | (空)' % b); continue
        row = ['..']*16
        for si, m, ls, v in ns:
            row[si] = nm(m)
        print('B%03d | %s' % (b, ' '.join('%2s' % x for x in row)))

show(0, 0, 32, '主旋律')
show(6, 0, 32, '管风琴层')
print('\nbpm=%.1f step=%.4fs bar=%.3fs' % (bpm, step, bar))
