# -*- coding: utf-8 -*-
"""判断两首原曲里哪个通道承担主旋律（melody_score 打分）。"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from midi2js import (parse_midi, extract_channels, chan_stats, channel_metrics,  # noqa: E402
                     melody_score)

B = os.path.join(
    r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main',
    '1 - Shooter Games', '6 - The Embodiment of Scarlet Devil')

for tag, name in [('SEP', '13. Septette for a Dead Princess (ZUN).mid'),
                  ('UN', '15. U.N. Owen was her (ZUN).mid')]:
    m = parse_midi(os.path.join(B, name))
    chans, segs, div = extract_channels(m)
    end = max(n['t'] + n['d'] for c in chans.values() for n in c['notes'])
    print('=' * 78)
    print(tag, 'end %.2fs' % end)
    rows = []
    for ch, c in sorted(chans.items()):
        st = chan_stats(c['notes'])
        st.update(channel_metrics(c['notes']))
        rows.append((melody_score(st, end), ch, st))
    for score, ch, st in sorted(rows, reverse=True):
        print('  ch%-3d score=%.3f n=%-5d med=%-3d poly=%.2f incov=%.2f dens=%.1f '
              'gap=%.1f leap=%.1f first=%.1f'
              % (ch, score, st['count'], st['med'], st['poly'], st['cov'], st['dens'],
                 st['gap'], st['leap'], st['first']))
