import json, os, numpy as np
ROOT = r'C:/Users/GuSheng/Downloads/HKS'
song = json.load(open(ROOT + '/tools/build/_cirno_lead/song.json', encoding='utf-8'))
if 'stage3' in song: song = song['stage3']
secs = json.load(open(ROOT + '/tools/build/_cirno_lead/secs.json', encoding='utf-8'))['secs']
tr = song['tracks']
print('duration', song['duration'], 'tracks', len(tr))
for t in tr:
    ns = t['notes']
    if not ns: continue
    lo = min(n[1] for n in ns); hi = max(n[1] for n in ns); end = max(n[0]+n[2] for n in ns)
    print('%-9s %-10s %5d  mid %3d-%3d  end %.2f' % (t['name'], t['wave'], len(ns), lo, hi, end))
lead = next(t for t in tr if t['name'] == 'lead')['notes']
lead = sorted(lead, key=lambda n: n[0])
print('lead notes', len(lead))
gaps = []
for a, b in zip(lead, lead[1:]):
    gap = b[0] - (a[0] + a[2])
    if gap > 1.2: gaps.append((round(a[0]+a[2],2), round(b[0],2), round(gap,2)))
print('lead gaps >1.2s:', gaps)
# 段落分布
for name, a, b in secs:
    seg = [n for n in tr if True]
    total = 0; ld = 0; drums = 0
    for t in tr:
        total += sum(1 for n in t['notes'] if a <= n[0] < b)
    ld = sum(1 for n in lead if a <= n[0] < b)
    dd = sum(1 for d in song['drums'] if a <= d[0] < b)
    dur = b - a
    print('%-9s %5.1f-%5.1f  notes %4d (%.1f/s)  lead %3d  drums %4d (%.1f/s)' % (name, a, b, total, total/dur, ld, dd, dd/dur))