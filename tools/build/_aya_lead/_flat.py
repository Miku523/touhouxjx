
# -*- coding: utf-8 -*-
"""把《風神少女》扒谱 MIDI 摊平成 154 BPM 恒定网格，输出 tools/build/_aya_lead/midi_flat.json"""
import sys, os, json
sys.path.insert(0, r'C:/Users/GuSheng/Downloads/HKS/tools')
import midi2js as M2

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
BASE = r'C:/Users/GuSheng/AppData/Local/Temp/thmidi/touhou-midi-collection-main/1 - Shooter Games/9 - Phantasmagoria of Flower View'
NAME = '11. Wind God Girl (Kanade_KND34).mid'
BPM = 154.0
BEAT = 60.0 / BPM

m = M2.parse_midi(os.path.join(BASE, NAME))
GRID = 1920
notes = []
for tr in m['tracks']:
    for e in tr['events']:
        if e[1] != 'on' or (len(e) > 4 and e[4] == 0):
            continue
        tick, ch, pitch = e[0], e[2], e[3]
        vel = e[4] if len(e) > 4 else 100
        bar = tick // GRID + 1
        beat = (tick % GRID) / 480.0
        notes.append({'ch': ch, 'tick': tick, 'bar': bar, 'beat': beat, 'm': pitch, 'v': vel})

# 关音：用 note on/off 配对求时值
offs = {}
for tr in m['tracks']:
    stack = {}
    for e in tr['events']:
        if e[1] == 'on' and (len(e) < 5 or e[4] > 0):
            stack.setdefault((e[2], e[3]), []).append(e[0])
        elif e[1] == 'off':
            key = (e[2], e[3])
            if stack.get(key):
                tk = stack[key].pop(0)
                offs[(tk, e[2], e[3])] = e[0]
for n in notes:
    off = offs.get((n['tick'], n['ch'], n['m']))
    if off is None:
        off = n['tick'] + 120
    n['d'] = max(0.05, (off - n['tick']) / 480.0 * BEAT)
    n['t'] = n['tick'] / 480.0 * BEAT
    del n['tick']

notes.sort(key=lambda n: (n['t'], n['ch'], n['m']))
out = {'bpm': BPM, 'beat': BEAT, 'bar': 4 * BEAT, 'grid': GRID,
       'src': NAME, 'notes': notes}
dst = os.path.join(ROOT, 'tools', 'build', '_aya_lead', 'midi_flat.json')
json.dump(out, open(dst, 'w', encoding='utf-8'), ensure_ascii=False)
print('wrote', dst, 'notes', len(notes), 'bars', max(n['bar'] for n in notes), 'end', round(max(n['t'] + n['d'] for n in notes), 3),
      'per-ch', {c: sum(1 for n in notes if n['ch'] == c) for c in sorted({n['ch'] for n in notes})})
