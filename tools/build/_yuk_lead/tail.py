# -*- coding: utf-8 -*-
import json, io
d = json.load(io.open('tools/build/_pret_ref/necrofantasia/midi_flat.json', encoding='utf-8'))
notes = d['notes']
out = []
for bar in range(112, 117):
    ev = [n for n in notes if n['bar'] == bar]
    out.append('== orig bar %d n=%d' % (bar, len(ev)))
    for n in sorted(ev, key=lambda z: (z['beat'], z['m']))[:40]:
        out.append('   beat %.2f m %d v %d d %.2f ch %d' % (n['beat'], n['m'], n['v'], n['d'], n['ch']))
io.open('tools/build/_yuk_lead/tail.txt', 'w', encoding='utf-8').write('\n'.join(out))
