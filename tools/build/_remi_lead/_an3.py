# -*- coding: utf-8 -*-
import sys, os, bisect, collections
ROOT = r'C:/Users/GuSheng/Downloads/HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from midi2js import parse_midi, extract_channels, tick_to_sec
MID = r'C:/Users/GuSheng/AppData/Local/Temp/thmidi/touhou-midi-collection-main/1 - Shooter Games/6 - The Embodiment of Scarlet Devil/13. Septette for a Dead Princess (ZUN).mid'
m = parse_midi(MID)
chans, segs, div = extract_channels(m)
bar_ticks = div * 4
names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def nm(p): return names[p % 12] + str(p // 12 - 1)
bar_t = [tick_to_sec(segs, div, b * bar_ticks) for b in range(0, 92)]

def sec2bar(s):
    return bisect.bisect_right(bar_t, s) - 1

# weighted pc per bar from harmonic channels
HARM = [2, 4, 13, 1, 11, 5]
pc = collections.defaultdict(lambda: collections.defaultdict(float))
for ch in HARM:
    for n in chans[ch].get('notes') or []:
        b = sec2bar(n['t'])
        pc[b][n['m'] % 12] += n['d'] * n['v']
# krumhansl for whole piece
KRU = {}
MAJ = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]
MIN = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17]
tot = collections.Counter()
for b, d in pc.items():
    for k, v in d.items(): tot[k] += v
def corr(a, b):
    ma, mb = sum(a)/len(a), sum(b)/len(b)
    num = sum((x-ma)*(y-mb) for x, y in zip(a, b))
    da = sum((x-ma)**2 for x in a) ** .5; db = sum((y-mb)**2 for y in b) ** .5
    return num/(da*db) if da*db else 0
vec = [tot[k] for k in range(12)]
res = []
for k in range(12):
    res.append(('major', names[k], round(corr(vec, [MAJ[(i-k) % 12] for i in range(12)]), 3)))
    res.append(('minor', names[k], round(corr(vec, [MIN[(i-k) % 12] for i in range(12)]), 3)))
res.sort(key=lambda x: -x[2])
print('key candidates:', res[:6])

# chord estimate per bar (triad over 12 roots, weight pcs in bar)
def chord_names(root, q):
    if q == 'maj': return [0,4,7]
    if q == 'min': return [0,3,7]
    if q == 'dim': return [0,3,6]
def est(b):
    d = pc.get(b) or {}
    if sum(d.values()) < 1: return None
    best = []
    for r in range(12):
        for q in ('maj','min','dim'):
            t = chord_names(r, q)
            e = sum(d.get((r+i) % 12, 0) for i in t)
            leak = sum(v for k, v in d.items() if k not in [(r+i) % 12 for i in t])
            best.append((e - leak * 0.55, names[r] + {'maj':'','min':'m','dim':'dim'}[q], round(e/(sum(d.values())+1e-9), 2)))
    best.sort(key=lambda x: -x[0])
    return best[0]
print()
for b in range(1, 82):
    e = est(b)
    print('bar %2d  %-6s  %5.2f   top: %s' % (b, e[1] if e else '-', e[2] if e else 0,
        ' '.join('%s%.2f' % (c, s) for _, c, s in sorted(((0,c,s) for _,c,s in (est(b) and [est(b)] or [])), key=lambda x:-x[2])[:1])))
