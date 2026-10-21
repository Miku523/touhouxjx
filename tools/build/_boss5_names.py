# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\7 - Perfect Cherry Blossom'
files = [f for f in os.listdir(BASE) if f.startswith('13. Bloom')]
for f in files:
    midi = M.parse_midi(os.path.join(BASE, f))
    print('###', f)
    for i, tr in enumerate(midi['tracks']):
        kinds = {}
        for ev in tr['events']:
            kinds[ev[1]] = kinds.get(ev[1], 0) + 1
        print('  tr%d name=%r notes=%d evs=%s' % (i, tr['name'], kinds.get('on', 0), kinds))
