
# -*- coding: utf-8 -*-
import os, sys, json, collections
ROOT = r"C:\Users\GuSheng\Downloads\HKS"
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
MIDI = r"C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\8 - Imperishable Night\15. Flight in the Bamboo Cutter ~ Lunatic Princess (ZUN).mid"
m = M.parse_midi(MIDI); div = m['division']
chans, segs, division = M.extract_channels(m)
alln = [n for c in chans.values() for n in c['notes']]
print('notes', len(alln), 'end', round(max(n['t']+n['d'] for n in alln),3))
for ch in sorted(chans):
    ns = chans[ch]['notes']
    if not ns: continue
    ps = [n['m'] for n in ns]
    prog = chans[ch]['progs']
    print('ch%-3d n=%4d %6.2f-%6.2f  pitch %d-%d med %d  progs %s' % (ch, len(ns), min(n['t'] for n in ns), max(n['t']+n['d'] for n in ns), min(ps), max(ps), sorted(ps)[len(ps)//2], dict(sorted(prog.items(), key=lambda x:-x[1])[:2])))
ds = chans.get(9, {}).get('notes', [])
print('drum count', len(ds), dict(collections.Counter(n['m'] for n in ds).most_common(14)))
json.dump({'tempo': [[s[0], s[1], s[2]] for s in segs], 'division': div}, open(os.path.join(ROOT,'tools/build/_kag_lead','tempo.json'),'w'))
out = []
for ch in sorted(chans):
    for n in chans[ch]['notes']:
        out.append({'ch': ch, 't': n['t'], 'd': n['d'], 'm': n['m'], 'v': n['v']})
json.dump({'bpm0': round(60e6/segs[0][2],3), 'notes': out}, open(os.path.join(ROOT,'tools/build/_kag_lead','midi_notes.json'),'w'))
print('saved')
