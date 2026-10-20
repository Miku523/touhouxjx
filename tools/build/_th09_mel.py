# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
base = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games'
mid = M.parse_midi(os.path.join(base, '9 - Phantasmagoria of Flower View', '7. Adventure of the Lovestruck Tomboy (ZUN).mid'))
chans, segs, div = M.extract_channels(mid)
bpm = M.bpm_of(segs)
print('TH09 bpm %.1f' % bpm)
for ch in (2, 10, 11, 3, 0, 4):
    ns = chans[ch]['notes']
    sel = [n for n in ns if 40 <= n['t'] < 52]
    print('ch%d prog=%s 40-52s 内 %d 音: %s' % (ch, list(chans[ch]['progs'].keys()), len(sel),
          ' '.join('%d@%.2f/%.2f' % (n['m'], n['t'], n['d']) for n in sel[:26])))
