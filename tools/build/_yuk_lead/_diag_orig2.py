# -*- coding: utf-8 -*-
import json, collections
src = json.load(open('tools/build/_pret_ref/necrofantasia/midi_flat.json', encoding='utf-8'))
notes = src['notes']
def sec(lo,hi):
    return [n for n in notes if lo <= n['bar'] <= hi]
def inv(lo,hi,label):
    sub = sec(lo,hi)
    per = collections.Counter(n['ch'] for n in sub)
    print('=== %s bars %d-%d  notes %d' % (label, lo, hi, len(sub)))
    for ch in sorted(per):
        ns = [n for n in sub if n['ch']==ch]
        avgv = sum(x['v'] for x in ns)/len(ns)
        # rough energy: count * vel^2
        en = sum((x['v']/127.0)**2 for x in ns)
        print(' ch%02d n=%4d midi %3d-%3d vel %3d-%3d avg %5.1f  energy %6.1f' % (ch, len(ns), min(x['m'] for x in ns), max(x['m'] for x in ns), min(x['v'] for x in ns), max(x['v'] for x in ns), avgv, en))
    return per
inv(2,17,'A')
inv(18,33,'B')
inv(34,49,'A2')
inv(50,65,'C')
inv(82,97,'D')
inv(98,113,'D2')
inv(114,116,'END')
# ch1 是否 ch0 的 +5 平行
sub = sec(2,17)
c0 = {(round(n["t"],4)): n['m'] for n in sub if n['ch']==0}
c1 = {(round(n["t"],4)): n['m'] for n in sub if n['ch']==1}
common = set(c0) & set(c1)
deltas = collections.Counter(c1[t]-c0[t] for t in common)
print('ch1-ch0 同刻音程分布', dict(deltas))
