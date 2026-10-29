# -*- coding: utf-8 -*-
import sys, os, glob, collections
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
base = M.SRC_BASE
p1 = os.path.join(base, '6 - The Embodiment of Scarlet Devil', '15. U.N. Owen was her (ZUN).mid')
d = M.parse_midi(p1); div = d['division']
evs = d['tracks'][0]['events']
tempos = [(e[0], e[2]) for e in evs if e[1]=='tempo']
def tick2sec(t):
    sec=0.0; prev=0; uspq=tempos[0][1]
    for tk,u in tempos:
        if tk<=t: sec += (tk-prev)*uspq/div/1e6; prev=tk; uspq=u
        else: break
    sec += (t-prev)*uspq/div/1e6
    return sec
offs = collections.defaultdict(list)
for e in evs:
    if e[1]=='off': offs[(e[2],e[3])].append(e[0])
notes=[]
for e in evs:
    if e[1]=='on' and e[4]>0:
        t0=e[0]; dur=None
        for t in offs.get((e[2],e[3]),[]):
            if t>t0: dur=t-t0; break
        if dur is None: dur = div//2
        notes.append([t0, e[2], e[3], e[4], dur])
KS_MAJ=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]
KS_MIN=[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17]
NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
pc=[0.0]*12
for n in notes:
    if n[1]==9: continue
    pc[n[2]%12]+= n[3]/127.0 * n[4]/div
tot=sum(pc)
best=[]
for root in range(12):
    for mode,prof in (('maj',KS_MAJ),('min',KS_MIN)):
        c=sum(pc[(root+i)%12]/tot*prof[i] for i in range(12))
        best.append((round(c,3),NAMES[root]+mode,root))
best.sort(reverse=True)
print('key top5:', [(k,c) for c,k,root in best[:5]])
print('top PC:', [(NAMES[i], round(pc[i]/tot*100,1)) for i in sorted(range(12), key=lambda i:-pc[i])[:8]])
# bar grid: assume 155bpm 4/4 -> bar = 4 beats; use tick->sec then sec/(4*60/155)
BEAT = 60/155.0; BAR = 4*BEAT
def bar_beat(tick):
    s = tick2sec(tick); b = s/BEAT
    return int(b//4)+1, b%4
# dump ch2 melody per bar for bars 1..40
for ch in (2, 6, 1, 8):
    print('=== ch%d ===' % ch)
    perbar = collections.defaultdict(list)
    for n in notes:
        if n[1]!=ch: continue
        bar, beat = bar_beat(n[0])
        if bar<=48:
            perbar[bar].append((round(beat,2), n[2], round(n[4]/div,2)))
    for bar in range(1,25):
        if bar in perbar:
            print(' bar%2d' % bar, perbar[bar][:12])
