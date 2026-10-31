# -*- coding: utf-8 -*-
import json, os, collections
HERE = os.path.dirname(os.path.abspath(__file__))
song = json.load(open(os.path.join(HERE, 'song.json'), encoding='utf-8'))
secs = json.load(open(os.path.join(HERE, 'secs.json'), encoding='utf-8'))
BAR = 1.65
dur = secs.get('_dur')
print('duration', song.get('duration'), 'bpm', song.get('bpm'), 'tracks', len(song['tracks']), 'drums', len(song.get('drums', [])))
# 每轨音数、音域
rows = []
for tr in song['tracks']:
    ps = [n[1] for n in tr['notes']]
    rows.append((tr.get('name','?'), len(tr['notes']), min(ps) if ps else 0, max(ps) if ps else 0, tr.get('gain')))
for r in sorted(rows, key=lambda x: -x[1]):
    print('%-10s %5d  %3d-%3d  gain %.3f' % r)
# 分段：每轨是否活跃 + 音符密度
names = [tr.get('name','?') for tr in song['tracks']]
print('\n分段活跃度（每段每轨音数，>0 才列出）:')
for k, v in secs.items():
    if k.startswith('_') or not isinstance(v, list):
        continue
    a0, a1 = v
    cnt = collections.Counter()
    for tr in song['tracks']:
        nm = tr.get('name','?')
        c = sum(1 for n in tr['notes'] if a0 <= n[0] < a1)
        if c: cnt[nm] = c
    tot = sum(cnt.values())
    top = ', '.join('%s:%d' % (k2, c) for k2, c in cnt.most_common(6))
    print('%-8s %6.2f-%6.2f  %4d 音  %s' % (k, a0, a1, tot, top))
