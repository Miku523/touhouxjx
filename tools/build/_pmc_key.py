# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M, preview_song as PS
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
MAJ=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]
MIN=[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17]
def detect(notes):
    h=[0.0]*12
    for n in notes: h[n['m']%12]+=n['d']
    best=[]
    for r in range(12):
        for prof,nm in ((MAJ,'大调'),(MIN,'小调')):
            best.append((sum(h[(r+i)%12]*prof[i] for i in range(12)), NAMES[r]+nm))
    best.sort(reverse=True); return best[:3]
base = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\6 - Arranges'
p = os.path.join(base, "IOSYS - Cirno's Perfect Math Class (ShinkoNet).mid")
chans, segs, div = M.extract_channels(M.parse_midi(p))
bpm = M.bpm_of(segs); bar=4*60/bpm
for ch in (2, 12, 4, 14):
    ns = chans[ch]['notes']
    print('ch%-2d key %s' % (ch, detect(ns)))
mel = chans[2]['notes']
print('ch2 每 4 小节音符数:', [len([n for n in mel if b*bar <= n['t'] < (b+4)*bar]) for b in range(0, 88, 4)])
def seq(notes, t0, t1):
    return ' '.join('%d' % n['m'] for n in sorted([n for n in notes if t0 <= n['t'] < t1], key=lambda x: x['t']))
print('ch2 10.5-18s:', seq(mel, 10.5, 18))
print('ch2 18-25s:', seq(mel, 18, 25))
print('ch2 60-67s:', seq(mel, 60, 67))
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\touhou.js','BOSS_SONGS','stage3')
th06 = [dict(t=(n['t'] if isinstance(n,dict) else n[0]), m=(n['m'] if isinstance(n,dict) else n[1]), d=(n['d'] if isinstance(n,dict) else n[2])) for n in s['tracks'][0]['notes']]
print('TH06 0-8s:', seq(th06, 0, 8))
print('TH06 key', detect(th06))
