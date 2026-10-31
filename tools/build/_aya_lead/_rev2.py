
import json, os
root = r"C:\Users\GuSheng\Downloads\HKS"
song = json.load(open(os.path.join(root,'tools/build/_aya_lead/song.json'), encoding='utf-8'))
secs = json.load(open(os.path.join(root,'tools/build/_aya_lead/secs.json'), encoding='utf-8'))
S = secs['secs']; TR = {t['name']:t['notes'] for t in song['tracks']}
def sec_of(t):
    for n,a,b in S:
        if a-1e-9 <= t < b-1e-9: return n
    return S[-1][0]
def win(nm):
    for n,a,b in S:
        if n==nm: return a,b
def seq(nm, name='lead'):
    a,b = win(nm); out=[]
    for t,m,d,v in sorted(TR[name]):
        if a-1e-9 <= t < b-1e-9: out.append((round(t-a,3), m, round(d,3)))
    return out
pairs = [('a2','a2b'),('b','b2'),('c1','c1b'),('c2','c2b')]
for x,y in pairs:
    sx, sy = seq(x), seq(y)
    px = [e[1] for e in sx]; py=[e[1] for e in sy]
    k = min(len(px),len(py))
    same = sum(1 for i in range(k) if px[i]==py[i])
    same_t = sum(1 for i in range(k) if sx[i][0]==sy[i][0] and px[i]==py[i])
    print('%s vs %s  lead notes %d/%d  pitch-same %d  time+pitch-same %d' % (x,y,len(px),len(py),same,same_t))
print()
# SFX velocities
for nm in ('knife','riser','reverse','bell','tick' if 'tick' in TR else 'bell'):
    if nm not in TR: continue
    ns = sorted(TR[nm])
    print(nm, 'count', len(ns), 'vel', [n[3] for n in ns][:20], 'times', [round(n[0],1) for n in ns][:20])
print()
# polyphony per section (max simultaneous across all tracks)
ev=[]
for tr in song['tracks']:
    for t,m,d,v in tr['notes']: ev.append((t,1,name if False else 0))
print('notes total', sum(len(v) for v in TR.values()))
# count voiced at each 1/8s for max
import collections
step=0.0625
for nm,a,b in S:
    ts = [t for tr in song['tracks'] for t,m,d,v in tr['notes'] if a-1e-9<=t<b-1e-9]
    # overlap count at sample times
    best=0
    for t in ts:
        c=sum(1 for tr in song['tracks'] for tt,mm,dd,vv in tr['notes'] if tt<=t+1e-6<tt+dd)
        best=max(best,c)
    print('POLY', nm.ljust(8), 'max', best, 'notesInSec', len(ts))
