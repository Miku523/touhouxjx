# -*- coding: utf-8 -*-
import os, json, io
HERE = os.path.dirname(os.path.abspath(__file__))
def load(p):
    S = json.load(io.open(p, encoding='utf-8'))
    if 'stage6' in S:
        S = S['stage6']
    return {t['name']: t['notes'] for t in S['tracks']}, S['drums']
new, nd = load(os.path.join(HERE, 'song.json'))
old, od = load(os.path.join(HERE, 'song9.json'))
A, B = 51.429, 54.545
for name in ('brass', 'strings', 'lead', 'counter', 'choir', 'piano'):
    a = [n for n in new.get(name, []) if A <= n[0] < B]
    b = [n for n in old.get(name, []) if A <= n[0] < B]
    print('%-8s new %3d (vel %s)  old %3d' % (name, len(a), [n[3] for n in a][:6], len(b)))
    if name == 'brass':
        print('   new pitches', [n[1] for n in a][:20])
        print('   durations', [n[2] for n in a][:8])
print('drums new', len([d for d in nd if A <= d[0] < B]), 'old', len([d for d in od if A <= d[0] < B]))
# 检查 B 段（26.494-51.429）brass 音数
for lo, hi, tag in ((26.494, 38.96, 'B1'), (38.96, 51.429, 'B2')):
    print(tag, 'brass new', len([n for n in new['brass'] if lo <= n[0] < hi]), 'old', len([n for n in old['brass'] if lo <= n[0] < hi]))
