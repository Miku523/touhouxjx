# -*- coding: utf-8 -*-
import os, sys, collections
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT,'tools'))
import midi2js as M
MIDI = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                    '8 - Imperishable Night', '3. Wriggling Autumn Moon ~ Mooned Insect (ZUN).mid')
mid = M.parse_midi(MIDI)
tr = mid['tracks']
print('tracks', len(tr), 'division', mid['division'])
# dump event kinds
kinds = collections.Counter()
tempos = []
ons = []
for ti, t in enumerate(tr):
    for ev in t['events']:
        kinds[ev[1]] += 1
        if ev[1] == 'tempo':
            tempos.append((ti, ev[0], ev[2] if len(ev)>2 else None))
        if ev[1] == 'on' and ev[4] > 0:
            ons.append((ev[0], ev[2], ev[3], ev[4]))
print('kinds', kinds)
print('tempos', tempos)
ons.sort()
print('first 8 ons', ons[:8])
print('max tick', ons[-1][0], 'bars ceil', -(-ons[-1][0]//1920))
print('bar of first', ons[0][0]//1920+1, 'beat', (ons[0][0]%1920)/480)
# 155 bpm seconds of last tick, and 51 bars
print('sec@155 last', round(ons[-1][0]/480*60/155,3), '51 bars sec', round(51*4*60/155,3))
# per-bar note counts to see structure
cnt = collections.Counter(o[0]//1920+1 for o in ons)
print('per-bar ons', [cnt.get(b,0) for b in range(1,53)])
