# -*- coding: utf-8 -*-
import sys, os, json
sys.path.insert(0, r'C:/Users/GuSheng/Downloads/HKS/tools')
import midi2js as M2
BASE = r'C:/Users/GuSheng/AppData/Local/Temp/thmidi/touhou-midi-collection-main/1 - Shooter Games/7 - Perfect Cherry Blossom'
NAME = '18. Necrofantasia (ZUN).mid'
m = M2.parse_midi(os.path.join(BASE, NAME))
print('keys', list(m.keys()))
print('division', m.get('division'), 'tempos', m.get('tempos')[:6] if m.get('tempos') else None)
print('timesigs', m.get('timeSigs') or m.get('timesigs'))
print('tracks', len(m['tracks']))
for i, tr in enumerate(m['tracks']):
    ons = [e for e in tr['events'] if e[1] == 'on' and not (len(e) > 4 and e[4] == 0)]
    if not ons: 
        print(i, 'empty', tr.get('name')); continue
    ms = [e[3] for e in ons]
    print(i, 'ch=%s' % ons[0][2], 'n=%d' % len(ons), 'min=%d max=%d' % (min(ms), max(ms)), 'firsttick=%d lasttick=%d' % (ons[0][0], ons[-1][0]), 'name=', tr.get('name'))
