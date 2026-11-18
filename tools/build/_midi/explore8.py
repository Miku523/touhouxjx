import sys, os, collections
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
import midi2js as M
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src')
def topmap(chans, ch):
    ons=collections.defaultdict(list)
    for n in chans[ch]['notes']:
        ons[round(n['t'],3)].append(n)
    return {t:max(x['m'] for x in g) for t,g in ons.items()}
out=[]
def cmp_pairs(key, fn, pairs, dr):
    midi=M.parse_midi(os.path.join(SRC,fn)); chans,segs,div=M.extract_channels(midi)
    maps={ch:topmap(chans,ch) for ch in set([a for a,_ in pairs]+[b for _,b in pairs])}
    for a,b in pairs:
        A,B=maps[a],maps[b]
        common=sorted(set(A)&set(B))
        diffs=collections.Counter(A[t]-B[t] for t in common)
        exact=sum(v for k,v in diffs.items() if k==0)
        out.append('%s ch%d vs ch%d: aligned_onsets=%d exact_same_pitch=%d (%.2f) diffs=%s' % (
            key,a,b,len(common),exact, exact/max(len(common),1), sorted(diffs.items(), key=lambda kv:-kv[1])[:8]))
cmp_pairs('tillwhen','11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid',
          [(0,3),(3,4),(0,4),(5,0),(6,11),(7,10),(8,1),(0,8)], 9)
cmp_pairs('border13','13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid',
          [(0,10),(0,3),(10,2),(2,12),(0,12),(10,6),(0,6),(14,10),(10,1)], 9)
cmp_pairs('border14','14. Border of Life (ZUN).mid',
          [(1,7),(0,1),(3,0),(7,6),(0,10),(8,5)], 9)
open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'explore8_out.txt'),'w',encoding='utf-8').write('\n'.join(out))
print('ok')
