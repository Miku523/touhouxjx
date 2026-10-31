# -*- coding: utf-8 -*-
import json, os, collections
HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(HERE, 'song.json'), encoding='utf-8'))
secs = json.load(open(os.path.join(HERE, 'secs.json'), encoding='utf-8'))['secs']
rows = []
for tr in d['tracks']:
    for n in tr['notes']:
        rows.append((n[0], tr['name'], n[1], n[2], n[3]))
def sec_of(x):
    for nm, a, b in secs:
        if a - 1e-6 <= x < b:
            return nm
    return 'tail'
issues = []
for st, nm, m, du, v in rows:
    if st < 0 or st > d['duration'] + 0.01: issues.append(('time', nm, st))
    if not (21 <= m <= 108): issues.append(('range', nm, m))
    if du < 0.03 or du > 8: issues.append(('dur', nm, du))
print('ISSUES', len(issues), issues[:8])
stats = {}
for st, nm, m, du, v in rows:
    s = sec_of(st)
    a = stats.setdefault(s, {'n': 0, 'per': collections.Counter(), 'm': [], 'v': []})
    a['n'] += 1; a['per'][nm] += 1; a['m'].append(m); a['v'].append(v)
for nm, a0, b0 in secs:
    x = stats.get(nm)
    if not x: continue
    ms = sorted(x['m']); vs = sorted(x['v'])
    print('%-6s %6.2f-%6.2f  n=%4d  med=%2d  vmed=%3d  top=%s' % (nm, a0, b0, x['n'], ms[len(ms)//2], vs[len(vs)//2],
          ','.join('%s%d' % (k, v) for k, v in x['per'].most_common(5))))
tr = {t['name']: sorted((n[0], n[0] + n[2], n[1]) for n in t['notes']) for t in d['tracks']}
names = [t['name'] for t in d['tracks']]
conf = []
for i in range(len(names)):
    for j in range(i + 1, len(names)):
        for a in tr[names[i]]:
            if a[1] - a[0] < 0.4: continue
            for b in tr[names[j]]:
                if b[1] - b[0] < 0.4: continue
                ov = min(a[1], b[1]) - max(a[0], b[0])
                if ov < 0.4: continue
                if abs((a[2] - b[2]) % 12) in (1, 11):
                    conf.append((names[i], a[2], names[j], b[2], round(max(a[0], b[0]), 2), round(ov, 2)))
print('SUSTAINED m2/M7', len(conf), conf[:6])
print('drums', len(d['drums']), collections.Counter(x[1] for x in d['drums']))
print('last end', max([n[0]+n[2] for t in d['tracks'] for n in t['notes']] + [x[0] for x in d['drums']]))
