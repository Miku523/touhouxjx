# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
p = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\6 - The Embodiment of Scarlet Devil\4. Lunate Elf (ZUN).mid'
mid = M.parse_midi(p); chans, segs, div = M.extract_channels(mid)
bpm = M.bpm_of(segs); bar = 4*60.0/bpm
dur = max(n['t']+n['d'] for c in chans.values() for n in c['notes'])
print('bpm %.2f bar %.4fs dur %.2f bars %.1f' % (bpm, bar, dur, dur/bar))
lead = chans[2]['notes']
for b in range(int(dur/bar)+1):
    a,z = b*bar, (b+1)*bar
    cnt = sum(1 for n in lead if a <= n['t'] < z)
    bass = [n['m']%12 for n in chans[1]['notes'] if a <= n['t'] < z]
    harm = sorted({n['m']%12 for n in chans[3]['notes'] if a <= n['t'] < z})
    print('  bar %2d  lead %2d  bass %s  piano %s' % (b+1, cnt, bass[:3], harm))
