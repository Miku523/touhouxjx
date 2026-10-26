# -*- coding: utf-8 -*-
"""列出一份 MIDI 的通道画像 + 逐小节顶线/低音，用来挑主旋律与找段落。

用法：python tools/build/_end_probe.py <midi> [bars] [--ch N]
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import midi2js as M

path = sys.argv[1]
mid = M.parse_midi(path)
chans, segs, div = M.extract_channels(mid)
bpm = M.bpm_of(segs)
print('bpm %.2f  div %d  end %.2fs' % (bpm, div, segs[-1][1]))

# 小节边界（按首段 tempo 估算，够用）
import math
bar = 4 * 60.0 / bpm
print('bar %.4fs' % bar)

rows = []
for ch, ns in sorted(chans.items()):
    notes = ns['notes'] if isinstance(ns, dict) else ns
    st = {}
    st.update(M.channel_metrics(notes))
    sc = M.melody_score(st, max(n['t'] + n['d'] for n in notes))
    rows.append((sc, ch, len(notes), st.get('median'), st.get('poly')))
for sc, ch, n, med, poly in sorted(rows, reverse=True)[:6]:
    print('  ch%-3d score %.3f  n=%-5d med=%s poly=%s' % (ch, sc, n, med, round(poly, 2) if poly else None))

if '--bars' in sys.argv or True:
    nbar = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else 0
    print()
    print('bar | ' + ' | '.join('ch%d top/bot/n' % c for c in sorted(chans)))
    for b in range(1, nbar + 1):
        cells = []
        for ch in sorted(chans):
            notes = chans[ch]['notes'] if isinstance(chans[ch], dict) else chans[ch]
            t0, t1 = (b - 1) * bar, b * bar
            sel = [n for n in notes if t0 <= n['t'] < t1]
            if not sel:
                cells.append('-')
            else:
                cells.append('%d/%d/%d' % (max(n['m'] for n in sel), min(n['m'] for n in sel), len(sel)))
        print('%3d | %s' % (b, ' | '.join(cells)))
