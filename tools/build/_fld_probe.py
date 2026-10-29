# -*- coding: utf-8 -*-
import sys, os, glob, collections
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
base = M.SRC_BASE; up = os.path.dirname(base)
cands = glob.glob(os.path.join(up, '6 - Arranges', '*Last Brutal Sister*')) + glob.glob(os.path.join(up, '6 - Arranges', '*Flandre*'))
print('cands:', cands)
p = cands[0]
d = M.parse_midi(p); div = d['division']
print('div', div, 'tracks', len(d['tracks']))
allnotes=[]
for ti,tr in enumerate(d['tracks']):
    notes=[e for e in tr['events'] if e[1]=='on' and e[4]>0]
    allnotes += notes
    if notes:
        print('  tr%-2d n=%-5d mean=%.1f range=%d-%d' % (ti, len(notes), sum(n[3] for n in notes)/len(notes), min(n[3] for n in notes), max(n[3] for n in notes)))
KS_MAJ=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]
KS_MIN=[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17]
NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
pc=[0.0]*12
for tr in d['tracks']:
    for e in tr['events']:
        if e[1]=='on' and e[4]>0: pc[e[3]%12]+= e[4]/127.0
tot=sum(pc)
best=[]
for root in range(12):
    for mode,prof in (('maj',KS_MAJ),('min',KS_MIN)):
        c=sum(pc[(root+i)%12]/tot*prof[i] for i in range(12))
        best.append((round(c,3),NAMES[root]+mode))
best.sort(reverse=True)
print('key top4:', [(k,c) for c,k in best[:4]])
print('top PC:', [(NAMES[i], round(pc[i]/tot*100,1)) for i in sorted(range(12), key=lambda i:-pc[i])[:8]])
# IOI histogram in ticks to guess grid
iois=collections.Counter()
for tr in d['tracks']:
    ons=[e[0] for e in tr['events'] if e[1]=='on' and e[4]>0]
    ons=sorted(set(ons))
    for a,b in zip(ons,onls) if False else []: pass
    for a,b in zip(ons, ons[1:]): iois[b-a]+=1
print('top IOI ticks:', iois.most_common(8))
# tempo events
temps=set()
for tr in d['tracks']:
    for e in tr['events']:
        if e[1]=='tempo': temps.add(e[2])
print('tempos:', sorted(temps)[:10], 'count', len(temps))
