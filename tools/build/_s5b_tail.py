# -*- coding: utf-8 -*-
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import midi2js as M
MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '7 - Perfect Cherry Blossom',
                   '13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid')
midi = M.parse_midi(MID); div = midi['division'] or 480; q = 4.0*div
notes = {}
for tr in midi['tracks']:
    pend = {}
    for ev in tr['events']:
        if ev[1] == 'on': pend.setdefault((ev[2], ev[3]), []).append((ev[0], ev[4]))
        elif ev[1] == 'off':
            st = pend.get((ev[2], ev[3]))
            if st:
                on, vel = st.pop(0)
                notes.setdefault(ev[2], []).append(dict(bar=on/q, dbar=max(ev[0],on+1)/q-on/q, m=ev[3], v=vel))
for ch in notes: notes[ch].sort(key=lambda n:(n['bar'], n['m']))
for ch in (1, 0, 3, 6, 10):
    ns = [n for n in notes.get(ch, []) if n['bar'] >= 88]
    print('ch%d @88+ :' % ch, ' '.join('%d@%.2f'%(n['m'],n['bar']) for n in ns[:30]))
print('ch0 @0-2 :', ' '.join('%d@%.2f/%.2f'%(n['m'],n['bar'],n['dbar']) for n in notes[0][:24]))
print('ch1 @0-2 :', ' '.join('%d@%.2f'%(n['m'],n['bar']) for n in notes[1][:14]))
print('ch9 per 4bar:', [sum(1 for n in notes[9] if b*4<=n['bar']<(b+1)*4) for b in range(0,23)])
