# -*- coding: utf-8 -*-
import json, os, statistics
HERE = os.path.dirname(os.path.abspath(__file__))
song = json.load(open(os.path.join(HERE, 'song.json'), encoding='utf-8'))
secs = json.load(open(os.path.join(HERE, 'secs.json'), encoding='utf-8'))
KEY = ['brass', 'strings', 'counter', 'piano', 'harpsi', 'arp', 'choir', 'pad', 'bell', 'bass']
# 同名轨有多条，用 (name, gain) 区分
tracks = [(i, tr.get('name','?'), tr.get('gain'), tr) for i, tr in enumerate(song['tracks'])]
print('sec      ' + ' '.join('%-9s' % k for k in KEY))
for k, v in secs.items():
    if k.startswith('_') or not isinstance(v, list):
        continue
    a0, a1 = v
    cells = []
    for name in KEY:
        best = None
        for i, nm, g, tr in tracks:
            if nm != name: continue
            sel = [n for n in tr['notes'] if a0 <= n[0] < a1]
            if not sel: continue
            med = statistics.median([n[1] for n in sel])
            snd = sum(min(n[2], a1 - n[0]) for n in sel)
            cand = (len(sel), med, snd, g)
            if best is None or cand[0] > best[0]: best = cand
        cells.append('%5d/%-3d' % (best[0], int(best[1])) if best else '    -/-  ')
    print('%-8s ' % k + ' '.join(cells))
