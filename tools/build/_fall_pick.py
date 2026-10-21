# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
f = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\10 - Mountain of Faith\8. Fall of Fall ~ Autumnal Waterfall (Samidare).mid'
midi = M.parse_midi(f)
chans, segs, div = M.extract_channels(midi)
end = max(n['t'] + n['d'] for c in chans.values() for n in c['notes'])
lead_s, bass_s, harm_s, reasons = M.pick_voices(chans, end, 'pre4')
print('自动选声部 reasons:', reasons)
print('lead:', {k: lead_s[k] for k in ('ch','notes') if k in lead_s} if 'ch' in lead_s else lead_s.keys())
print('bass ch:', bass_s.get('ch'))
print('harm chs:', [h.get('ch') for h in harm_s])
for r in reasons if isinstance(reasons, list) else [reasons]:
    print('  -', r)
