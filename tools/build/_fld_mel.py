# -*- coding: utf-8 -*-
import sys, os, collections, json
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
BASE_BEAT = 60/155.0
def tick2beat(t): return tick2sec(t)/BASE_BEAT
offs=collections.defaultdict(list)
for e in evs:
    if e[1]=='off': offs[(e[2],e[3])].append(e[0])
notes=[]
for e in evs:
    if e[1]=='on' and e[4]>0:
        t0=e[0]; dur=None
        for t in offs.get((e[2],e[3]),[]):
            if t>t0: dur=t-t0; break
        if dur is None: dur=div//2
        b0=tick2beat(t0); b1=tick2beat(t0+dur)
        notes.append(dict(ch=e[2], p=e[3], v=e[4], b0=b0, b1=max(b1,b0+0.05)))
NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def nm(p): return NAMES[p%12]+str(p//12-1)
CH = {'Dm':[2,5,9],'Em':[4,7,11],'F':[5,9,0],'Gm':[7,10,2],'Am':[9,0,4],'Bb':[10,2,5],
 'C':[0,4,7],'Eb':[3,7,10],'A7':[9,1,4,7],'D7':[2,6,9,0],'G7':[7,11,2,5],'Bdim':[11,2,5],'Ddim':[2,5,8],'F#dim':[6,9,0],'Bb7':[10,2,5,1]}
rows=[]
for bar in range(1, 41):
    lo=(bar-1)*4; hi=bar*4
    pcs=collections.Counter()
    for n in notes:
        if n['ch']==9: continue
        if n['b1']<=lo or n['b0']>=hi: continue
        ov=min(n['b1'],hi)-max(n['b0'],lo)
        pcs[n['p']%12]+=ov*n['v']/127.0
    tot=sum(pcs.values()) or 1
    best=[]
    for name,pcs_ in CH.items():
        score=sum(pcs[c]/tot for c in pcs_)/len(pcs_)*3 - sum(pcs[c]/tot for c in set(range(12))-set(pcs_))/max(1,12-len(pcs_))
        best.append((score,name))
    best.sort(reverse=True)
    mel=[n for n in notes if n['ch']==2 and n['b0']>=lo and n['b0']<hi]
    mel.sort(key=lambda n:n['b0'])
    rows.append(dict(bar=bar, chord=best[0][1], chord2=best[1][1],
        pcs={NAMES[k]:round(v/tot*100,1) for k,v in pcs.most_common(5)},
        mel=[[round(m['b0']-(bar-1)*4,2), m['p'], round(m['b1']-m['b0'],2), m['v']] for m in mel]))
for r in rows:
    if not r['mel']: continue
    s=' '.join('%s@%.2f/%.2f' % (nm(m[1]), m[0], m[2]) for m in r['mel'])
    print('bar%2d %-4s/%-4s %s' % (r['bar'], r['chord'], r['chord2'], s))
json.dump(rows, open(os.path.join(ROOT,'tools','build','_fld_lead_chords.json'),'w',encoding='utf-8'), ensure_ascii=False)
