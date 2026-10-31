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
OFF=440; BAR=1920
bpm0 = 60e6/segs[0][2]; barsec=4*60.0/bpm0
def bb(sec, off=0):
    tk = sec/(60.0/bpm0)*div + off
    b=int(tk//BAR)+1; bt=round((tk-(b-1)*BAR)/div,2)
    return b,bt
for bar in (21,22,23,24,25,26,27,28):
    t0=(bar-1)*barsec+OFF/div*(60.0/bpm0); t1=t0+barsec
    print('### bar',bar,'(%.2f-%.2f)'%(t0,t1))
    for ch in (1,2,3,4,5,6,7,8,10,11,13):
        sub=[n for n in chans.get(ch,{}).get('notes',[]) if t0<=n['t']<t1]
        if not sub: continue
        row=[(bb(n['t'])[0], bb(n['t'])[1], n['m'], round(n['d']/(barsec/4),2), n['v']) for n in sub]
        print('  ch%-2d'%ch, row)
