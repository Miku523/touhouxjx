# -*- coding: utf-8 -*-
import json, io
d = json.load(io.open('tools/build/_pret_ref/necrofantasia/midi_flat.json', encoding='utf-8'))
notes = d['notes']
out = []
for bar in (113, 114, 115, 116):
    ev = [n for n in notes if n['bar'] == bar]
    pitches = {}
    for n in ev:
        pitches[n['m'] % 12] = pitches.get(n['m'] % 12, 0) + 1
    out.append('bar %d count %d' % (bar, len(ev)))
    out.append('  pitch classes %s' % sorted(pitches.items(), key=lambda kv: -kv[1]))
    early = [n for n in ev if n['beat'] < 1.0]
    out.append('  beat0 pitches %s' % sorted(set(n['m'] for n in early)))
    last = sorted(ev, key=lambda z: z['beat'])[-6:]
    out.append('  last events %s' % [(round(n['beat'],2), n['m'], n['ch']) for n in last])
io.open('tools/build/_yuk_lead/tail2.txt', 'w', encoding='utf-8').write('\n'.join(out))
