# -*- coding: utf-8 -*-
"""快速查看两首原曲 MIDI 各通道内容，帮助定编排。"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from midi2js import parse_midi, extract_channels  # noqa: E402

B = os.path.join(
    r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main',
    '1 - Shooter Games', '6 - The Embodiment of Scarlet Devil')

SONGS = [
    ('SEP', '13. Septette for a Dead Princess (ZUN).mid'),
    ('UN', '15. U.N. Owen was her (ZUN).mid'),
]

for tag, name in SONGS:
    m = parse_midi(os.path.join(B, name))
    chans, segs, div = extract_channels(m)
    print('=' * 72)
    print(tag, 'div', div, 'chans', sorted(chans))
    for ch in sorted(chans):
        ns = chans[ch]['notes']
        if not ns:
            continue
        head = [(round(x['t'], 2), x['m'], round(x['d'], 2), x['v']) for x in ns[:8]]
        print('-- ch%d n=%d head=%s' % (ch, len(ns), head))
