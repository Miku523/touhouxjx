# -*- coding: utf-8 -*-
"""《竹取飛翔 ～ Lunatic Princess》原 MIDI 结构分析：BPM、通道、小节、每小节和弦估计。

用法: python tools/build/_kaguya_orig.py
输出: tools/build/_kaguya_orig.json
"""
import json
import os
import sys

import numpy as np

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from midi2js import parse_midi, extract_channels  # noqa: E402

MID = (r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
       r'\1 - Shooter Games\8 - Imperishable Night'
       r'\15. Flight in the Bamboo Cutter ~ Lunatic Princess (ZUN).mid')

NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
TEMPLATES = {
    'maj': [0, 4, 7], 'min': [0, 3, 7], 'dim': [0, 3, 6], 'aug': [0, 4, 8],
    'maj7': [0, 4, 7, 11], 'min7': [0, 3, 7, 10], '7': [0, 4, 7, 10],
    'sus4': [0, 5, 7], 'dim7': [0, 3, 6, 9],
}


def chord_of(pcs, root_hint=None):
    pcs = [p % 12 for p in pcs]
    best = None
    for root in range(12):
        for kind, tpl in TEMPLATES.items():
            notes = {(root + i) % 12 for i in tpl}
            inter = len(notes & set(pcs))
            score = inter / len(notes) - 0.4 * (len(notes - set(pcs)))
            if root_hint is not None and root != root_hint % 12:
                score -= 0.15
            if best is None or score > best[0]:
                best = (score, NAMES[root] + ('' if kind == 'maj' else ('m' if kind == 'min' else kind)), root)
    return best[1], best[2]


def main():
    midi = parse_midi(MID)
    chans, segs, division = extract_channels(midi)
    uspq = segs[0][2]
    bpm = 60e6 / uspq
    dur = max(n['t'] + n['d'] for c in chans.values() for n in c['notes'])
    sec_per_beat = uspq / 1e6
    bar = sec_per_beat * 4
    print('division %d  变拍=%s  BPM %.3f  小节长 %.4fs  总时长 %.2fs  小节数 %d'
          % (division, len({s[2] for s in segs}) > 1, bpm, bar, dur, int(np.ceil(dur / bar))))
    print('tempo segs:', [(round(s[0], 2), round(s[1], 3)) for s in segs[:8]])

    info = {}
    for ch, c in sorted(chans.items()):
        ns = c['notes']
        if not ns:
            continue
        p = np.array([n['m'] for n in ns])
        progs = c.get('progs') or {}
        prog = max(progs, key=progs.get) if progs else '-'
        span = max(n['t'] + n['d'] for n in ns)
        # 只在哪些小节有音
        bars = sorted({int(n['t'] / bar) for n in ns})
        info[ch] = dict(prog=prog, n=len(ns), med=int(np.median(p)), lo=int(p.min()), hi=int(p.max()),
                        first=round(ns[0]['t'], 2), last=round(span, 2), nbars=len(bars))
        print('ch%-2d prog=%-3s 音=%-5d 中位=%-3d 范围 %2d-%2d (%-6s..%-6s) 首 %6.2f 末 %6.2f 有音小节 %d'
              % (ch, prog, len(ns), int(np.median(p)), p.min(), p.max(),
                 NAMES[p.min() % 12] + str(p.min() // 12 - 1), NAMES[p.max() % 12] + str(p.max() // 12 - 1),
                 ns[0]['t'], span, len(bars)))

    nbars = int(np.ceil(dur / bar)) + 1
    # 全曲音级直方图
    hist = np.zeros(12)
    for c in chans.values():
        for n in c['notes']:
            hist[n['m'] % 12] += n['d']
    hist = hist / hist.sum()
    print('\n音级加权占比（降序）：')
    print('  ' + '  '.join('%s %.3f' % (NAMES[i], hist[i]) for i in np.argsort(-hist)[:7]))

    # 每小节和弦（只用 ch11 类铺底通道会更好，这里先全通道 chroma）
    chroma = np.zeros((nbars, 12))
    for ch_, c in chans.items():
        for n in c['notes']:
            b = int(n['t'] / bar)
            if b < nbars:
                chroma[b, n['m'] % 12] += n['d']
    ch_list = []
    for b in range(nbars):
        if chroma[b].sum() <= 0:
            ch_list.append(None)
            continue
        name, root = chord_of([i for i in range(12) if chroma[b, i] > 0])
        ch_list.append(name)

    # 用 2 小节窗口重估（更稳）
    ch2 = []
    for b in range(0, nbars, 2):
        blk = chroma[b:b + 2].sum(axis=0)
        if blk.sum() <= 0:
            ch2.append(None)
            continue
        name, _ = chord_of([i for i in range(12) if blk[i] > 0])
        ch2.append(name)
    print('\n每 2 小节和弦：')
    for i, cname in enumerate(ch2):
        print('  %3d-%3d  %s' % (i * 2 + 1, i * 2 + 2, cname))

    out = dict(bpm=bpm, bar_sec=bar, step=bar / 16, duration=dur, nbars=nbars,
               chan={str(k): v for k, v in info.items()}, hist={NAMES[i]: round(float(hist[i]), 4) for i in range(12)},
               chord_bar=ch_list, chord_2bar=ch2,
               notes={str(k): [[round(n['t'], 4), n['m'], round(n['d'], 4), n['v']] for n in c['notes']]
                      for k, c in chans.items()})
    p = os.path.join(ROOT, 'tools', 'build', '_kaguya_orig.json')
    json.dump(out, open(p, 'w', encoding='utf-8'), ensure_ascii=False)
    print('\n写出', p)


if __name__ == '__main__':
    main()
