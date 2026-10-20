# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M, preview_song as PS
base = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\6 - Arranges'
p = os.path.join(base, "IOSYS - Cirno's Perfect Math Class (ShinkoNet).mid")
chans, segs, div = M.extract_channels(M.parse_midi(p))
def contour(seq):
    return [seq[i+1]-seq[i] for i in range(len(seq)-1)]
def grams(seq, k=5):
    return set(tuple(seq[i:i+k]) for i in range(len(seq)-k+1))
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\touhou.js','BOSS_SONGS','stage3')
th06 = [m for t,m in sorted([((n['t'] if isinstance(n,dict) else n[0]), (n['m'] if isinstance(n,dict) else n[1])) for n in s['tracks'][0]['notes']])]
ref = grams(contour(th06))
print('TH06 轮廓 5-gram %d' % len(ref))
res=[]
for ch in sorted(chans):
    ns = chans[ch]['notes']
    if len(ns) < 40: continue
    seq=[n['m'] for n in sorted(ns, key=lambda x:x['t'])]
    g = grams(contour(seq))
    res.append((len(ref & g)/max(1,len(g)), ch, len(ns), len(g)))
res.sort(reverse=True)
for a,ch,n,g in res[:6]:
    print('ch%-2d n=%-4d 轮廓重合 %.3f（%d gram）' % (ch, n, a, g))
