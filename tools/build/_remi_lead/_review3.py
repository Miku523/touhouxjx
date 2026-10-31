# -*- coding: utf-8 -*-
import json, os, collections
HERE = os.path.dirname(os.path.abspath(__file__))
song = json.load(open(os.path.join(HERE, 'song.json'), encoding='utf-8'))
secs = json.load(open(os.path.join(HERE, 'secs.json'), encoding='utf-8'))
KIND = {0:'kick',1:'snare',2:'hat',3:'ohat',4:'crash',5:'tom',6:'tom2',7:'ride',8:'rev',9:'roll'}
print('sec      drums  kinds')
for k, v in secs.items():
    if k.startswith('_') or not isinstance(v, list):
        continue
    a0, a1 = v
    c = collections.Counter()
    for d in song.get('drums', []):
        if a0 <= d[0] < a1:
            c[d[1]] += 1
    tot = sum(c.values())
    span = a1 - a0
    print('%-8s %4d  (%.1f/s)  %s' % (k, tot, tot / span, ', '.join('%s:%d' % (KIND.get(kk, kk), cc) for kk, cc in sorted(c.items()))))
# 空隙扫描：主奏（brass+strings+counter+arp）最长静默
lead = []
for tr in song['tracks']:
    if tr.get('name') in ('brass', 'strings', 'counter', 'arp'):
        for n in tr['notes']:
            lead.append((n[0], n[0] + n[2]))
lead.sort()
gaps, cur = [], 0.0
for s, e in lead:
    if s - cur > 1.2: gaps.append((round(cur, 2), round(s, 2), round(s - cur, 2)))
    cur = max(cur, e)
print('\n主奏静默 > 1.2s:', gaps)
