# -*- coding: utf-8 -*-
"""和弦分析：从 MIDI 通道的贝斯 + 和声轨逐小节推断根音与和弦音。"""

MINOR_SCALE = {0, 2, 3, 5, 7, 8, 10}


def crop(notes, t0, t1):
    return [n for n in notes if t0 <= n['t'] < t1]


def weighted_pc(notes):
    w = {}
    for n in notes:
        w[n['m'] % 12] = w.get(n['m'] % 12, 0.0) + max(0.05, n['d']) * (0.6 + 0.4 * n['v'] / 127.0)
    return w


def analyse_chords(bass, harm, bars, bar, t0=19.862):
    chords = []
    for b in range(bars):
        a, z = t0 + b * bar, t0 + (b + 1) * bar
        bs = crop(bass, a, z)
        hs = crop(harm, a, z)
        w = weighted_pc(bs)
        for pc, v in weighted_pc(hs).items():
            w[pc] = w.get(pc, 0.0) + v * 0.55
        if not w:
            chords.append(dict(root=0, tones=MINOR_SCALE, bass=None, third=3, seventh=None))
            continue
        root_pc = max(w, key=lambda k: w[k])
        if bs:
            low = min(bs, key=lambda n: n['m'])
            if w.get(low['m'] % 12, 0) >= 0.55 * w[root_pc]:
                root_pc = low['m'] % 12
        rel = {(n['m'] - root_pc) % 12 for n in hs + bs}
        third = 3 if 3 in rel and 4 not in rel else (4 if 4 in rel else 3)
        seventh = 10 if 10 in rel else (11 if 11 in rel else None)
        tones = {0, third, 7}
        if seventh is not None:
            tones.add(seventh)
        if 2 in rel or 9 in rel:
            tones.add(2)
        chords.append(dict(root=root_pc, tones=tones,
                           bass=min((n['m'] for n in bs), default=None),
                           third=third, seventh=seventh))
    return chords


def chord_symbol(c):
    names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    if c.get('seventh') == 10:
        q = 'm7' if c.get('third') == 3 else '7'
    elif c.get('seventh') == 11:
        q = 'maj7'
    else:
        q = 'm' if c.get('third') == 3 else ''
    return names[c['root']] + q
