# -*- coding: utf-8 -*-
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
SEC = json.load(open(os.path.join(HERE, 'secs.json'), encoding='utf-8'))
song = json.load(open(os.path.join(HERE, 'song.json'), encoding='utf-8'))
tr = {t['name']: t['notes'] for t in song['tracks']}
dr = song['drums']
order = ['intro','organ','vibes','theme','theme2','bridge','var1','var2','coda']
def sec_of(t):
    for k in order:
        a, b = SEC[k]
        if a <= t < b: return k
    return 'coda'
print('== 每段音数（每秒） ==')
hdr = '%-8s' % 'track' + ''.join('%11s' % k for k in order)
print(hdr)
for name in sorted(tr, key=lambda n: -len(tr[n])):
    cnt = {k: 0 for k in order}
    for n in tr[name]: cnt[sec_of(n[0])] += 1
    row = '%-8s' % name
    for k in order:
        a, b = SEC[k]; dur = b - a
        row += '%11s' % ('%d/%.1f' % (cnt[k], cnt[k] / dur))
    print(row)
print()
print('== 鼓（每秒） ==')
kinds = {0:'kick',1:'snare',2:'hat',3:'open',4:'crash',5:'tom',6:'tom2',7:'ride',8:'rev',9:'roll'}
for k in order:
    a, b = SEC[k]; dur = b - a
    per = {kk: 0 for kk in kinds}
    for e in dr:
        if a <= e[0] < b: per[e[1]] = per.get(e[1], 0) + 1
    tot = sum(per.values())
    parts = ' '.join('%s %d' % (kinds.get(x, x), per.get(x, 0)) for x in sorted(per) if per.get(x))
    print('%-8s %6.2f/s  %s' % (k, tot / dur, parts))
print()
# lead 空窗
lead = sorted(n[0] for n in tr['lead'])
gaps = []
prev = None
for t in lead:
    if prev is not None and t - prev > 2.0:
        gaps.append((round(prev,2), round(t,2), round(t-prev,2)))
    prev = t
print('lead 音域 %.0f-%.0f 首音 %.2f 末音 %.2f' % (min(n[1] for n in tr['lead']), max(n[1] for n in tr['lead']), lead[0], lead[-1]))
print('lead 空窗 >2s:', gaps)
# 每轨音域
for name in sorted(tr):
    ns = tr[name]
    print('%-8s n=%-4d range %d-%d  t %.2f-%.2f' % (name, len(ns), min(x[1] for x in ns), max(x[1] for x in ns), min(x[0] for x in ns), max(x[0] for x in ns)))
