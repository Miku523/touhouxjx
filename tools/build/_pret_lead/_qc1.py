# -*- coding: utf-8 -*-
"""道中曲通用 QC：node 读取 JS -> timing/range/同时发声/持续不协和/鼓统计/逐段音数
用法：python tools/build/_pret_lead/_qc1.py <name> [export] [keyname]
"""
import json, os, subprocess, collections, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
name = sys.argv[1]
export = sys.argv[2] if len(sys.argv) > 2 else None
keyname = sys.argv[3] if len(sys.argv) > 3 else None
JS = os.path.join(ROOT, 'src', 'engine', 'songs', name + '.js')
mjs = os.path.join(HERE, '_dump.mjs')
open(mjs, 'w', encoding='utf-8').write(
  "import { pathToFileURL } from 'node:url';\n"
  "const m = await import(pathToFileURL(process.argv[2]).href);\n"
  "const ex = m[" + json.dumps(export) + "] || Object.values(m)[0];\n"
  "const k = " + json.dumps(keyname) + " || Object.keys(ex)[0];\n"
  "console.log(JSON.stringify(ex[k]));\n")
out = subprocess.run(['node', mjs, JS], capture_output=True, text=True, encoding='utf-8')
if out.returncode != 0:
    print('NODE ERR', out.stderr[:2000]); raise SystemExit(1)
song = json.loads(out.stdout)
BAR = 60 / song['bpm'] * 4
print('name', name, 'duration', song['duration'], 'bpm', song['bpm'], 'tracks', len(song['tracks']), 'notes', sum(len(t['notes']) for t in song['tracks']), 'drums', len(song['drums']))
issues = []
last = 0
for tr in song['tracks']:
    n = tr['notes']
    for t, m, d, v in n:
        if t < 0 or t > song['duration'] + 0.01: issues.append(('timing', tr['name'], t))
        if not (21 <= m <= 108): issues.append(('range', tr['name'], t, m))
        if d <= 0 or d > 8: issues.append(('dur', tr['name'], t, d))
        last = max(last, t + d)
    ev = []
    for t, m, d, v in n:
        ev.append((t, 1)); ev.append((t + d, -1))
    ev.sort()
    cur = mx = 0
    for t, k in ev:
        cur += k; mx = max(mx, cur)
    if n:
        print('  %-8s n=%-5d poly=%-2d %d-%d' % (tr['name'], len(n), mx, min(x[1] for x in n), max(x[1] for x in n)))
    if mx > 8: issues.append(('poly', tr['name'], mx))
    if tr['name'] not in ('pad',):
        pass
segs = []
for tr in song['tracks']:
    for t, m, d, v in tr['notes']:
        if d >= 0.4: segs.append((t, t + d, m, tr['name']))
pairs = []
for i in range(len(segs)):
    for j in range(i + 1, len(segs)):
        a, b = segs[i], segs[j]
        ov = min(a[1], b[1]) - max(a[0], b[0])
        if ov >= 0.4 and (a[2] - b[2]) % 12 in (1, 11):
            pairs.append((round(max(a[0], b[0]), 2), a[3], a[2], b[3], b[2]))
print('sustained m2/M7 pairs:', len(pairs))
for p in pairs[:12]: print('  ', p)
sect = json.load(open(os.path.join(HERE, name + '_secs.json'), encoding='utf-8'))['secs']
for tag, s0, s1 in sect:
    cnt = sum(1 for tr in song['tracks'] for t, m, d, v in tr['notes'] if s0 <= t < s1)
    dk = sum(1 for e in song['drums'] if s0 <= e[0] < s1)
    print('  %-8s %7.2f-%7.2f notes=%-5d drums=%-4d %.1f/s' % (tag, s0, s1, cnt, dk, dk / max(0.01, s1 - s0)))
kinds = collections.Counter(e[1] for e in song['drums'])
print('drum kinds', dict(sorted(kinds.items())))
print('last end', round(last, 3))
print('ISSUES', len(issues), issues[:8])