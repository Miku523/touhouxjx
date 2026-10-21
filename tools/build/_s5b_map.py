# -*- coding: utf-8 -*-
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import midi2js as M
MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '7 - Perfect Cherry Blossom',
                   '13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid')
midi = M.parse_midi(MID)
div = midi['division'] or 480
q = 4.0 * div
notes = {}
for tr in midi['tracks']:
    pend = {}
    for ev in tr['events']:
        if ev[1] == 'on':
            pend.setdefault((ev[2], ev[3]), []).append((ev[0], ev[4]))
        elif ev[1] == 'off':
            st = pend.get((ev[2], ev[3]))
            if st:
                on, vel = st.pop(0)
                notes.setdefault(ev[2], []).append(dict(bar=on/q, dbar=max(ev[0],on+1)/q - on/q, m=ev[3], v=vel))
for ch in notes: notes[ch].sort(key=lambda n:(n['bar'], n['m']))
bars = {}
for ch, ns in sorted(notes.items()):
    b0 = ns[0]['bar']; b1 = max(n['bar']+n['dbar'] for n in ns)
    print('ch%-2d n=%4d bar %6.2f -> %6.2f  (%d bars)' % (ch, len(ns), b0, b1, b1-b0))
print('total bars %.2f' % max(max(n['bar']+n['dbar'] for n in ns) for ns in notes.values()))
print('--- ch0/ch1/ch10/ch14 notes in bars 84-91 (pitch @bar) ---')
for ch in (0,1,3,10,14):
    ns=[n for n in notes.get(ch,[]) if n['bar']>=84]
    if ns:
        print('ch%d:'%ch, ' '.join('%d@%.2f'%(n['m'],n['bar']) for n in ns[:26]))
print('--- ch2 last 10 ---')
print(' '.join('%d@%.2f/%.2f'%(n['m'],n['bar'],n['dbar']) for n in notes.get(2,[])[-10:]))
print('--- ch9 last 8 ---')
print(' '.join('%d@%.2f'%(n['m'],n['bar']) for n in notes.get(9,[])[-8:]))
