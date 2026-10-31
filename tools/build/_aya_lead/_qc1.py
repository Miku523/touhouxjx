
# -*- coding: utf-8 -*-
import json, os, collections
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
LEAD = os.path.join(ROOT, 'tools', 'build', '_aya_lead')
song = json.load(open(os.path.join(LEAD, 'song.json'), encoding='utf-8'))
sec = json.load(open(os.path.join(LEAD, 'secs.json'), encoding='utf-8'))
DUR = song['duration']
issues = []
for tr in song['tracks']:
    prev = -1
    for n in tr['notes']:
        t, m, d, v = n
        if t < 0 or t >= DUR: issues.append(('time', tr['name'], n))
        if m < 21 or m > 108: issues.append(('range', tr['name'], n))
        if d <= 0: issues.append(('dur', tr['name'], n))
        if t < prev - 1e-6: issues.append(('order', tr['name'], n))
        prev = t
# 同时发声
for tr in song['tracks']:
    c = collections.Counter()
    for t, m, d, v in tr['notes']:
        c[round(t, 3)] += 1
    mx = max(c.values()) if c else 0
    if mx > 6: issues.append(('poly', tr['name'], mx))
print('ISSUES', len(issues), issues[:8])
print('notes', sum(len(t['notes']) for t in song['tracks']), 'drums', len(song['drums']), 'dur', DUR)
print()
print('分段音数 / 鼓数 / lead 音数:')
lead = [t for t in song['tracks'] if t['name'] == 'lead'][0]['notes']
for name, a, b in sec['secs']:
    nn = sum(1 for t in song['tracks'] for n in t['notes'] if a - 1e-6 <= n[0] < b)
    dd = sum(1 for d in song['drums'] if a - 1e-6 <= d[0] < b)
    ll = sum(1 for n in lead if a - 1e-6 <= n[0] < b)
    print('  %-9s %6.2f-%6.2f  notes %4d  drums %4d  lead %4d  %.1f/s' % (name, a, b, nn, dd, ll, dd / (b - a)))
# lead 空窗
gaps = []
prev_end = 0
for t, m, d, v in lead:
    if t - prev_end > 1.2:
        gaps.append((round(prev_end, 2), round(t, 2), round(t - prev_end, 2)))
    prev_end = max(prev_end, t + d)
print()
print('lead 空窗 >1.2s:', gaps)
print('鼓 kinds:', dict(collections.Counter(d[1] for d in song['drums'])))
