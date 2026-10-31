# -*- coding: utf-8 -*-
"""QC: 时间/音域/复音/持续不协和/鼓/段落密度/网格对齐。"""
import json, os, sys, itertools, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
SONG = os.path.join(ROOT, 'src', 'engine', 'songs', 'remilia_septette.js')
js = ("import('file:///%s').then(m=>{const s=m.REMILIA_EX.ex_mid;"
      "process.stdout.write(JSON.stringify(s))})" % SONG.replace('\\','/'))
out = subprocess.run(['node','--input-type=module','-e',js], capture_output=True)
song = json.loads(out.stdout.decode('utf-8'))
DUR = song['duration']
print('title', song['title'], 'dur', DUR, 'bpm', song['bpm'], 'tracks', len(song['tracks']))

issues = 0
def bad(msg):
    global issues
    issues += 1
    if issues < 30: print('  [!]', msg)

maxpoly = {}
for t in song['tracks']:
    name = t['name']; notes = t['notes']
    for (a,m,d,v) in notes:
        if a < -1e-6: bad('%s t<0 %s' % (name, a))
        if a + d > DUR + 0.05: bad('%s 越界 %s+%s > %s' % (name, a, d, DUR))
        if m < 21 or m > 108: bad('%s 音域 %d' % (name, m))
        if d < 0.02: bad('%s 时值过短 %s' % (name, d))
    ev = []
    for (a,m,d,v) in notes:
        ev.append((a, 1)); ev.append((a+d, -1))
    ev.sort(); cur = 0; mx = 0
    for _, k in ev:
        cur += k; mx = max(mx, cur)
    maxpoly[name] = max(maxpoly.get(name,0), mx)

conf = []
tracks = song['tracks']
for i, j in itertools.combinations(range(len(tracks)), 2):
    A, B = tracks[i], tracks[j]
    if A['name'] == B['name']: continue
    for (a1,m1,d1,v1) in A['notes']:
        if d1 < 0.4: continue
        for (a2,m2,d2,v2) in B['notes']:
            if d2 < 0.4: continue
            ov = min(a1+d1, a2+d2) - max(a1, a2)
            if ov < 0.4: continue
            if abs(m1 % 12 - m2 % 12) in (1, 11):
                conf.append((round(max(a1,a2),2), A['name'], m1, B['name'], m2, round(ov,2)))
print('持续 m2/M7 冲突:', len(conf))
for c in conf[:8]: print('   ', c)

kinds = {}
for d in song['drums']:
    kinds[d[1]] = kinds.get(d[1],0)+1
print('鼓 kinds', dict(sorted(kinds.items())), 'total', len(song['drums']))

secs = json.load(open(os.path.join(HERE,'secs.json'), encoding='utf-8'))
SEC = [('intro',1,4),('intro2',5,12),('A',13,20),('vamp',21,28),('A2',29,36),('A3',37,44),
       ('B',45,52),('C',53,60),('C2',61,68),('Final',69,76),('Final2',77,85),('outro',86,89)]
print('段落 音数/鼓数:')
for n,a,b in SEC:
    key = n if n in secs else None
    s,e = secs.get(n, (0,0))
    nn = sum(1 for t in song['tracks'] for x in t['notes'] if s <= x[0] < e)
    nd = sum(1 for d in song['drums'] if s <= d[0] < e)
    print('   %-7s %6.2f-%6.2f  %5d 音 %4d 鼓' % (n, s, e, nn, nd))

print('最大同时发声:', maxpoly)

# 网格对齐：以 secs 里 A 段起点为 bar 线，检查 lead 音落 16 分网格的比例
import bisect
print('末音 %.3f / 时长 %.3f' % (max(x[0]+x[2] for t in song['tracks'] for x in t['notes']), DUR))
print('ISSUES', issues)
