# -*- coding: utf-8 -*-
"""曲目数据 QC：node 读取 JS -> 检查 timing/range/同时发声/持续不协和/鼓统计"""
import json, os, subprocess, collections
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'kaguya_stage6.js')
mjs = os.path.join(HERE, '_dump.mjs')
open(mjs, 'w', encoding='utf-8').write(
  "import { pathToFileURL } from 'node:url';\n"
  "const m = await import(pathToFileURL(process.argv[2]).href);\n"
  "console.log(JSON.stringify(m.KAGUYA_STAGE6.stage6));\n")
out = subprocess.run(['node', mjs, JS], capture_output=True, text=True, encoding='utf-8')
if out.returncode != 0:
    print('NODE ERR', out.stderr[:2000]); raise SystemExit(1)
song = json.loads(out.stdout)
BAR = 60/154*4
print('duration', song['duration'], 'bpm', song['bpm'], 'tracks', len(song['tracks']), 'drums', len(song['drums']))
issues = []
last = 0
for tr in song['tracks']:
    n = tr['notes']
    for t, m, d, v in n:
        if t < 0 or t > song['duration'] + 0.01: issues.append(('timing', tr['name'], t))
        if not (21 <= m <= 108): issues.append(('range', tr['name'], t, m))
        last = max(last, t + d)
    # 同时发声
    ev = []
    for t, m, d, v in n:
        ev.append((t, 1)); ev.append((t + d, -1))
    ev.sort()
    cur = mx = 0
    for t, k in ev:
        cur += k; mx = max(mx, cur)
    print('%-8s n=%-5d poly=%-2d %d-%d' % (tr['name'], len(n), mx, min(x[1] for x in n), max(x[1] for x in n)))
    if mx > 8: issues.append(('poly', tr['name'], mx))
# 持续小二度扫描（同曲内跨轨、都 >=0.4s、重叠 >=0.4s）
segs = []
for tr in song['tracks']:
    for t, m, d, v in tr['notes']:
        if d >= 0.4: segs.append((t, t + d, m, tr['name']))
cnt = collections.Counter()
pairs = []
for i in range(len(segs)):
    for j in range(i + 1, len(segs)):
        a, b = segs[i], segs[j]
        ov = min(a[1], b[1]) - max(a[0], b[0])
        if ov >= 0.4 and (a[2] - b[2]) % 12 in (1, 11):
            pairs.append((round(max(a[0], b[0]), 2), a[3], a[2], b[3], b[2]))
            cnt[(a[3], b[3])] += 1
print('sustained m2/M7 pairs:', len(pairs))
for p in pairs[:14]: print('  ', p)
kinds = collections.Counter(e[1] for e in song['drums'])
print('drum kinds', dict(sorted(kinds.items())))
print('last end', round(last, 3))
print('ISSUES', len(issues), issues[:6])
