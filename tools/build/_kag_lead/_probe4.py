
# -*- coding: utf-8 -*-
import os, sys, json, collections
ROOT = r"C:\Users\GuSheng\Downloads\HKS"
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
MIDI = r"C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\8 - Imperishable Night\15. Flight in the Bamboo Cutter ~ Lunatic Princess (ZUN).mid"
m = M.parse_midi(MIDI)
rows = []
for tr in m['tracks']:
    pend = {}
    for ev in tr['events']:
        k = ev[1]
        if k == 'on': pend.setdefault((ev[2], ev[3]), []).append((ev[0], ev[4]))
        elif k == 'off':
            st = pend.get((ev[2], ev[3]))
            if st:
                t0, v = st.pop(0); rows.append((t0, max(ev[0], t0+1), ev[3], v, ev[2]))
CH = collections.defaultdict(list)
for t0,t1,p,v,ch in rows: CH[ch].append((t0,t1,p,v))
PC = 'C C# D D# E F F# G G# A A# B'.split()
def hist(notes):
    h = collections.Counter(p % 12 for (_,_,p,_) in notes)
    return ' '.join('%s:%d' % (PC[k], h[k]) for k in range(12) if h[k])
print('ALL', hist([(a,b,c,d) for ch in CH for (a,b,c,d) in CH[ch] if ch != 9]))
for ch in [0,1,2,5,6,8,10,11,4,13]:
    print('ch%-2d' % ch, hist(CH[ch]))
# dup checks
def sig(n): return sorted((t0, p) for (t0,t1,p,v) in n)
for a,b in [(5,12),(10,11),(1,2),(0,4)]:
    sa, sb = sig(CH[a]), sig(CH[b])
    inter = len(set(sa) & set(sb))
    print('dup ch%d vs ch%d: %d / %d / %d' % (a,b,inter,len(sa),len(sb)))
# drums 16-step + bar counts
dr = CH[9]
DRUMNAME = {35:'K',36:'K',38:'S',39:'S2',40:'S',41:'S3',42:'H',44:'H',46:'OH',49:'C',51:'R',53:'R'}
for lo,hi,tag in [(0,4,'intro'),(5,18,'A'),(18,34,'B'),(36,52,'C'),(52,58,'brk'),(58,92,'D'),(92,101,'out')]:
    sub = [d for d in dr if lo*1920 <= d[0] < hi*1920]
    if not sub: continue
    bins = collections.Counter()
    for (t0,t1,p,v) in sub: bins[(p, round(((t0 % 1920) / 120)) % 16)] += 1
    print(tag, 'n=%d' % len(sub), ' '.join('%s@%s:%d' % (DRUMNAME.get(p,p), b, c) for (p,b),c in sorted(bins.items()) if c> len(sub)/40)[:400])
