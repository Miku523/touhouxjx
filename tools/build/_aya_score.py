# -*- coding: utf-8 -*-
"""把《風神少女》MIDI 量化成「16 分音符网格」的乐谱 JSON，供编曲脚本使用。
输出 tools/build/_aya_score.json:
{
  "bpm_orig": 154.0, "bars": N,
  "chord": ["Fm7", ...],            # 每小节一个和弦名（12 模板 + 低音根音）
  "ch": {"0": [[bar, step, midi, len_steps, vel], ...], ...}
}
"""
import json, os, sys
import numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from midi2js import parse_midi, extract_channels

MID = (r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
       r'\1 - Shooter Games\9 - Phantasmagoria of Flower View'
       r'\11. Wind God Girl (Kanade_KND34).mid')
NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

midi = parse_midi(MID)
chans, segs, div = extract_channels(midi)
bpm = 60.0 / (segs[0][2] / 1e6)
step = 60.0 / bpm / 4
bar_sec = step * 16
dur = max(n['t'] + n['d'] for c in chans.values() for n in c['notes'])
nbars = int(np.ceil(dur / bar_sec))

grid = {}
for ch, c in chans.items():
    g = []
    for n in c['notes']:
        s = round(n['t'] / step)
        b, si = divmod(s, 16)
        ls = max(1, round(n['d'] / step))
        g.append([b, si, n['m'], ls, n['v']])
    g.sort(key=lambda x: (x[0], x[1], -x[2]))
    grid[ch] = g

# 每小节和弦：ch2(piano) + ch11(strings) + ch1/ch7 的 chroma，模板匹配
TEMPL = {'': [0, 4, 7], 'm': [0, 3, 7], '7': [0, 4, 7, 10], 'm7': [0, 3, 7, 10],
         'maj7': [0, 4, 7, 11], 'dim': [0, 3, 6], 'm7b5': [0, 3, 6, 10], 'sus4': [0, 5, 7]}
chroma = np.zeros((nbars, 12))
for ch in (1, 2, 7, 8, 11):
    for b, si, m, ls, v in grid.get(ch, []):
        if b < nbars:
            chroma[b, m % 12] += ls * v / 100.0
chords = []
for b in range(nbars):
    v = chroma[b]
    if v.sum() < 1e-9:
        chords.append(None); continue
    v = v / v.sum()
    best = (-9, '?')
    for root in range(12):
        for suf, tpl in TEMPL.items():
            s = sum(v[(root + i) % 12] for i in tpl) - 0.3 * sum(
                v[(root + i) % 12] for i in range(12) if i not in tpl)
            if s > best[0]:
                best = (s, NAMES[root] + suf)
    chords.append(best[1])

data = {'bpm_orig': bpm, 'step': step, 'bar_sec': bar_sec, 'bars': nbars,
        'duration': dur, 'chord': chords,
        'ch': {str(k): v for k, v in grid.items()}}
out = os.path.join(ROOT, 'tools', 'build', '_aya_score.json')
json.dump(data, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
print('bars', nbars, 'bpm', round(bpm, 2), '->', out)
print('和弦前 40 小节:', ' '.join((c or '-') for c in chords[:40]))
