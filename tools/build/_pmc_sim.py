# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M, preview_song as PS
base = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\6 - Arranges'
p = os.path.join(base, "IOSYS - Cirno's Perfect Math Class (ShinkoNet).mid")
chans, segs, div = M.extract_channels(M.parse_midi(p))
bpm = M.bpm_of(segs); bar=4*60/bpm
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\touhou.js','BOSS_SONGS','stage3')
th06 = sorted([((n['t'] if isinstance(n,dict) else n[0]), (n['m'] if isinstance(n,dict) else n[1])) for n in s['tracks'][0]['notes']])
def ngrams(seq, k=4):
    return set(tuple(seq[i:i+k]) for i in range(len(seq)-k+1))
ref = ngrams([m for t,m in th06])
print('TH06 主旋律 4-gram 数 %d' % len(ref))
def best_ch(notes):
    seq = [n['m'] for n in sorted(notes, key=lambda x: x['t'])]
    out=[]
    for d in range(12):
        g = ngrams([(m+d) for m in seq])
        out.append((len(ref & g)/max(1,len(g)), d))
    out.sort(reverse=True)
    return out[:3]
for ch in (2, 12, 4, 14, 5):
    ns = chans[ch]['notes']
    if len(ns) < 20: continue
    print('ch%-2d 与 TH06 主旋律的重合率（最佳移调）: %s' % (ch, [(round(a,3), d) for a,d in best_ch(ns)]))
