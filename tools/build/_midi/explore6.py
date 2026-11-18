import sys, os, collections
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
import midi2js as M
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src')
FILES = [
 ('tillwhen', '11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid'),
 ('border13', '13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid'),
 ('border14', '14. Border of Life (ZUN).mid'),
]
DRUM_CH = {'tillwhen':[9], 'border13':[9], 'border14':[9]}
out=[]
for key, fn in FILES:
    midi = M.parse_midi(os.path.join(SRC, fn))
    chans, segs, div = M.extract_channels(midi)
    STEP=0.25
    grid=collections.defaultdict(list)
    tmax=0
    for ch,c in chans.items():
        if ch in DRUM_CH[key]: continue
        for n in c['notes']:
            t0=int(n['t']/STEP); t1=int((n['t']+n['d'])/STEP)
            for i in range(t0,t1+1): grid[i].append((ch,n['m']))
            tmax=max(tmax,t1)
    runs=[]
    for i in range(0, tmax+1):
        lst=grid.get(i)
        if not lst:
            mx=None; who=set()
        else:
            mx=max(p for _,p in lst); who=set(c for c,p in lst if p==mx)
        runs.append((i*STEP, mx, who))
    out.append('######## ' + key)
    cur=None
    for t,mx,who in runs:
        k2 = tuple(sorted(who))
        if cur and cur[2]==k2:
            cur[1]=t+STEP; cur[4].append(mx)
        else:
            if cur:
                vals=sorted(set(v for v in cur[4] if v is not None))
                out.append('  %6.2f-%6.2f ch%s top=%s' % (cur[0],cur[1],cur[2],','.join(str(x) for x in vals)))
            cur=[t,t+STEP,k2,mx,[mx]]
    if cur:
        vals=sorted(set(v for v in cur[4] if v is not None))
        out.append('  %6.2f-%6.2f ch%s top=%s' % (cur[0],cur[1],cur[2],','.join(str(x) for x in vals)))
    cnt=collections.Counter()
    for t,mx,who in runs:
        for c in who: cnt[c]+=1
    out.append('  TOP-HOLD COUNTS: %s' % sorted(cnt.items(), key=lambda kv:-kv[1]))
open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'explore6_out.txt'),'w',encoding='utf-8').write('\n'.join(out))
print('lines',len(out))
