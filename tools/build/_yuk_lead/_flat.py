# -*- coding: utf-8 -*-
"""Necrofantasia (ZUN) -> 恒定网格 midi_flat.json + 概览"""
import sys, os, json
sys.path.insert(0, r'C:/Users/GuSheng/Downloads/HKS/tools')
import midi2js as M2
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = r'C:/Users/GuSheng/AppData/Local/Temp/thmidi/touhou-midi-collection-main/1 - Shooter Games/7 - Perfect Cherry Blossom'
NAME = '18. Necrofantasia (ZUN).mid'
BPM = 164.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
m = M2.parse_midi(os.path.join(BASE, NAME))
DIV = m['division']
ev = m['tracks'][0]['events']

ons = []
stack = defaultdict(list)
offs = {}
for e in ev:
    if e[1] == 'on' and not (len(e) > 4 and e[4] == 0):
        ons.append(e)
    elif e[1] == 'off':
        stack[(e[2], e[3])].append(e[0])
for (ch, k), lst in stack.items():
    for tick in lst:
        offs.setdefault((ch, k), []).append(tick)
offs = {k: sorted(v) for k, v in offs.items()}

notes = []
for e in ons:
    tick, ch, midi, vel = e[0], e[2], e[3], e[4]
    lst = offs.get((ch, midi)) or []
    off = next((o for o in lst if o > tick), None)
    if off is None:
        off = tick + 120
    dur = max(0.05, (off - tick) / DIV * BEAT)
    bar = tick // (DIV * 4) + 1
    beat = (tick % (DIV * 4)) / DIV
    notes.append(dict(ch=ch, bar=bar, beat=round(beat, 4), t=round(tick / DIV * BEAT, 4),
                      m=midi, v=vel, d=round(dur, 4)))
notes.sort(key=lambda n: (n['t'], n['ch'], n['m']))
out = dict(bpm=BPM, beat=BEAT, bar_len=BAR, division=DIV, src=NAME, notes=notes)
json.dump(out, open(os.path.join(HERE, 'midi_flat.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('notes', len(notes), 'bars', max(n['bar'] for n in notes), 'end', round(max(n['t'] + n['d'] for n in notes), 3))

# 通道概览
by = defaultdict(list)
for n in notes: by[n['ch']].append(n)
for ch in sorted(by):
    ns = by[ch]
    print('ch%-2d n=%-4d midi %d-%d  t %.2f-%.2f  vel %d-%d' % (ch, len(ns), min(x['m'] for x in ns), max(x['m'] for x in ns),
          ns[0]['t'], ns[-1]['t'] + ns[-1]['d'], min(x['v'] for x in ns), max(x['v'] for x in ns)))
