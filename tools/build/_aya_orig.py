# -*- coding: utf-8 -*-
"""《風神少女》原 MIDI 结构分析：速度、小节、旋律分段、每小节和弦估计。

用法: python tools/build/_aya_orig.py
输出: tools/build/_aya_orig.json（供编曲脚本直接读）
"""
import json
import os
import sys

import numpy as np

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from midi2js import parse_midi, build_tempo_map, extract_channels  # noqa: E402

MID = (r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
       r'\1 - Shooter Games\9 - Phantasmagoria of Flower View'
       r'\11. Wind Girl Girl.mid'.replace('Wind Girl Girl', 'Wind God Girl (Kanade_KND34)'))

NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def main():
    midi = parse_midi(MID)
    tracks = midi['tracks']
    division = midi['division']
    chans, segs, division = extract_channels(midi)
    dur = max(n['t'] + n['d'] for c in chans.values() for n in c['notes'])
    print('division', division, 'tempo segs', [(round(s[0], 3), round(s[1], 2)) for s in segs][:6])
    print('总时长 %.2fs' % dur)
    for ch, c in sorted(chans.items()):
        ns = c['notes']
        if not ns:
            continue
        p = np.array([n['m'] for n in ns])
        print('  ch%-2d prog=%-3s 音=%-5d 中位=%-3d 范围 %d-%d 首 %.2f 末 %.2f'
              % (ch, (max(c.get('progs') or {-1:0}, key=(c.get('progs') or {-1:0}).get) if c.get('progs') else '-'), len(ns), int(np.median(p)), p.min(), p.max(),
                 ns[0]['t'], max(n['t'] + n['d'] for n in ns)))
    uspq = segs[0][2]
    sec_per_beat = uspq / 1e6
    bpm = 60.0 / sec_per_beat
    print('BPM %.2f (恒定=%s)' % (bpm, len({s[2] for s in segs}) == 1))

    # 每小节和弦（chroma 模板）：把全曲按 4/4 切小节
    bar = sec_per_beat * 4
    nbars = int(np.ceil(dur / bar))
    chroma = np.zeros((nbars, 12))
    for ch, c in chans.items():
        for n in c['notes']:
            b = int(n['t'] / bar)
            if b >= nbars:
                continue
            w = n['d']
            chroma[b, n['m'] % 12] += w
    chord_templates = {
        'maj': [0, 4, 7], 'min': [0, 3, 7], 'dim': [0, 3, 6],
        'maj7': [0, 4, 7, 11], 'min7': [0, 3, 7, 10], '7': [0, 4, 7, 10],
        'sus4': [0, 5, 7],
    }
    best = []
    for b in range(nbars):
        v = chroma[b]
        if v.sum() < 1e-6:
            best.append(None)
            continue
        v = v / v.sum()
        cands = []
        for root in range(12):
            for name, tpl in chord_templates.items():
                s = 0.0
                for i in tpl:
                    s += v[(root + i) % 12]
                # 惩罚非和弦音
                s -= 0.25 * sum(v[(root + i) % 12] for i in range(12) if i not in tpl)
                cands.append((s, NAMES[root] + ('' if name == 'maj' else ' ' + name)))
        cands.sort(reverse=True)
        best.append((cands[0][1], round(float(cands[0][0]), 2), cands[1][1]))

    # 旋律（ch0 trumpet）：按小节统计音数与音高
    mel = chans.get(0, {}).get('notes', [])
    bars = {}
    for n in mel:
        b = int(n['t'] / bar)
        bars.setdefault(b, []).append((round(n['t'], 3), n['m'], round(n['d'], 3)))
    print('\n每小节和弦 + 旋律音数（bar: chord | 音数, 前 6 音）')
    for b in range(nbars):
        line = 'B%03d %-8s' % (b, (best[b][0] if best[b] else '-'))
        if b in bars:
            ns = bars[b]
            line += ' | %d 音: %s' % (len(ns), ' '.join('%d@%.2f' % (m, t) for t, m, d in ns[:8]))
        print(line)

    data = {
        'bpm': bpm, 'bar_sec': bar, 'duration': dur, 'division': division,
        'chords': [b[0] if b else None for b in best],
        'melody': [[round(n['t'], 4), n['m'], round(n['d'], 4)] for n in mel],
        'channels': {str(ch): {'prog': (max(c.get('progs') or {-1:0}, key=(c.get('progs') or {-1:0}).get) if c.get('progs') else '-'), 'notes': len(c['notes']),
                               'median': int(np.median([n['m'] for n in c['notes']])) if c['notes'] else 0}
                     for ch, c in chans.items()},
    }
    out = os.path.join(ROOT, 'tools', 'build', '_aya_orig.json')
    json.dump(data, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
    print('\n写入', out)


if __name__ == '__main__':
    main()
