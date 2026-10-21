# -*- coding: utf-8 -*-
"""用琶音层（ch5/ch12）与低音层（ch9/ch1）推每小节和弦，输出到 _kaguya_harm.json。"""
import json
import os
import sys

import numpy as np

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
mid = json.load(open(os.path.join(ROOT, 'tools', 'build', '_kaguya_orig.json'), encoding='utf-8'))
NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
BAR = mid['bar_sec']
NB = mid['nbars']

TEMPLATES = [('', [0, 4, 7]), ('m', [0, 3, 7]), ('dim', [0, 3, 6]), ('aug', [0, 4, 8]),
             ('7', [0, 4, 7, 10]), ('m7', [0, 3, 7, 10]), ('maj7', [0, 4, 7, 11]),
             ('m6', [0, 3, 7, 9]), ('sus4', [0, 5, 7])]


def name(root, kind):
    return NAMES_FLAT[root] + kind


def fit(pcs, root_hint=None):
    """pcs: 加权 dict pc->weight。返回 (名字, root)。"""
    best = None
    total = sum(pcs.values()) or 1
    for root in range(12):
        for kind, tpl in TEMPLATES:
            notes = [(root + i) % 12 for i in tpl]
            inside = sum(pcs.get(n, 0) for n in notes) / total
            outside = 1 - inside
            score = inside - 0.9 * outside
            if root_hint is not None:
                # 根音倾向：低音层出现该音加分
                score += 0.35 * (pcs.get(root, 0) / total)
                if root == root_hint:
                    score += 0.05
            if best is None or score > best[0]:
                best = (score, name(root, kind), root)
    return best[1], best[2]


def main():
    def layer(chs, b0, b1):
        rows = {}
        for ch in chs:
            for t, m, d, v in mid['notes'][str(ch)]:
                b = int(t / BAR)
                if b0 <= b < b1:
                    rows.setdefault(b, {})
                    rows[b][m % 12] = rows[b].get(m % 12, 0) + d
        return rows

    arp = layer([5, 12], 0, NB)
    bass = layer([9], 0, NB)
    bass2 = layer([1], 0, NB)
    # 低音根音：取该小节最低音
    broot = {}
    for ch in [9, 1]:
        for t, m, d, v in mid['notes'][str(ch)]:
            b = int(t / BAR)
            if b < NB:
                if b not in broot or m < broot[b]:
                    broot[b] = m
    out = {}
    print('bar  琶音音级              低音   -> 和弦')
    for b in range(NB):
        pcs = dict(arp.get(b, {}))
        if not pcs:
            continue
        hint = broot[b] % 12 if b in broot else None
        nm, root = fit(pcs, hint)
        out[str(b)] = nm
        srt = ' '.join(NAMES[p] for p, w in sorted(pcs.items(), key=lambda kv: -kv[1]))
        print('%3d  %-22s %-4s -> %s' % (b + 1, srt, NAMES[hint] if hint is not None else '-', nm))

    json.dump(out, open(os.path.join(ROOT, 'tools', 'build', '_kaguya_harm.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=0)


if __name__ == '__main__':
    main()
