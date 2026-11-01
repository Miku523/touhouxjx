
# -*- coding: utf-8 -*-
import os, sys, json, collections
ROOT = r"C:\Users\GuSheng\Downloads\HKS"
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
MIDI = r"C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\8 - Imperishable Night\15. Flight in the Bamboo Cutter ~ Lunatic Princess (ZUN).mid"
m = M.parse_midi(MIDI); div = m['division']
# raw ticks
rows = []
for tr in m['tracks']:
    pend = {}
    for ev in tr['events']:
        k = ev[1]
        if k == 'on':
            pend.setdefault((ev[2], ev[3]), []).append((ev[0], ev[4]))
        elif k == 'off':
            st = pend.get((ev[2], ev[3]))
            if st:
                t0, v = st.pop(0)
                rows.append((t0, max(ev[0], t0+1), ev[3], v, ev[2]))
max_tick = max(r[1] for r in rows)
NBARS = max_tick // 1920 + 1
print('notes', len(rows), 'max_tick', max_tick, 'bars', NBARS)
CH = collections.defaultdict(list)
for t0, t1, p, v, ch in rows:
    CH[ch].append((t0, t1, p, v))
TOT = collections.Counter()
for ch in CH: TOT[ch] = len(CH[ch])
print('channels', dict(sorted(TOT.items())))
# per bar matrix
print('bar ' + ' '.join('%2d' % c for c in range(16)))
for b in range(NBARS):
    lo, hi = b*1920, (b+1)*1920
    cnt = [sum(1 for (t0,t1,p,v) in CH[c] if lo <= t0 < hi) for c in range(16)]
    print('%3d ' % (b+1) + ' '.join('%2d' % x for x in cnt))
json.dump([[b+1] + [sum(1 for (t0,t1,p,v) in CH[c] if b*1920 <= t0 < (b+1)*1920) for c in range(16)] for b in range(NBARS)],
          open(os.path.join(ROOT,'tools/build/_kag_lead','bar_matrix.json'),'w'))
