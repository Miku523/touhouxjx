# -*- coding: utf-8 -*-
import os, sys, collections
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games'
MIDI = os.path.join(BASE, '6 - The Embodiment of Scarlet Devil', '5. Tomboyish Girl in Love (ZUN).mid')
mid = M.parse_midi(MIDI); div = mid['division'] or 480
segs = M.build_tempo_map(mid['tracks'], div)
chans,_,_ = M.extract_channels(mid)
OFF = 440; BAR = 1920
bpm0 = 60e6/segs[0][2]; barsec = 4*60.0/bpm0; beatsec = barsec/4
def barbeat(sec):
    tk = sec/(60.0/bpm0)*div + OFF   # approx: time->tick (tempo const in main body)
    b = int(tk//BAR)+1
    bt = (tk - (b-1)*BAR)/div
    return b, round(bt,2)
for ch in sorted(chans):
    c=chans[ch]; ns=c['notes']
    if not ns or ch in (9,10,11,12,13,14): continue
    print('=== ch',ch,'n',len(ns))
    # per bar counts 30-42
    row=[]
    for bar in range(30,43):
        t0=(bar-1)*barsec; t1=bar*barsec
        sub=[n for n in ns if t0<=n['t']<t1]
        row.append((bar,len(sub),sorted(set(n['m'] for n in sub))[:6]))
    for r in row: print('  ',r)
