
# -*- coding: utf-8 -*-
import os, sys, json, collections
ROOT = r"C:\Users\GuSheng\Downloads\HKS"
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
MIDI = r"C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\8 - Imperishable Night\15. Flight in the Bamboo Cutter ~ Lunatic Princess (ZUN).mid"
m = M.parse_midi(MIDI)
div = m['division']
print('division', div, 'tracks', len(m['tracks']))
chans, segs, division = M.extract_channels(m)
print('tempo segs', [(s[0], round(s[1],3), round(60e6/s[2],2)) for s in segs][:12])
tot = 0
keys = sorted(chans)
for ch in keys:
    ns = chans[ch]['notes']
    tot += len(ns)
    if not ns: continue
    ps = [n[2] for n in ns]
    t0 = M.tick_to_sec(segs, division, min(n[0] for n in ns))
    t1 = M.tick_to_sec(segs, division, max(n[1] for n in ns))
    print('ch%-3d notes %4d  %5.2f-%6.2f s  pitch %d-%d med %d  progs %s' % (
        ch, len(ns), t0, t1, min(ps), max(ps), sorted(ps)[len(ps)//2], dict(chans[ch]['progs'].most_common(3))))
print('total', tot)
# drum channel 9 pitch histogram
for ch in keys:
    ns = chans[ch]['notes']
    if not ns: continue
    hist = collections.Counter(n[2] for n in ns)
    if ch == 9:
        print('drums', dict(hist.most_common(12)), 'count', len(ns))
json.dump({'division': div, 'segs': [[s[0], s[1], s[2]] for s in segs]}, open(os.path.join(ROOT,'tools/build/_kag_lead','tempo.json'),'w'))
