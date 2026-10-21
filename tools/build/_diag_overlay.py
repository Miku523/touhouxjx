# -*- coding: utf-8 -*-
"""诊断叠加稿：原曲两条旋律层各自和新版主旋律撞多少，以及新版主旋律留了多少空。"""
import json

STEP = 240 / 154 / 16
BASE = r'C:\Users\GuSheng\Downloads\HKS\tools\build'


def load(p):
    return json.load(open(BASE + '\\' + p, encoding='utf-8'))


new = load('_aya_fb.json')
old = load('_old_stage4.json')
lead = [(t, t + d, m) for (t, m, d, v) in new['tracks'][0]['notes']]
pad = [(t, t + d, m) for (t, m, d, v) in new['tracks'][3]['notes']]


def clashrate(layer, md=0.12):
    tot = semi = 0
    for (t, m, d, v) in layer:
        if d < md:
            continue
        for (s, e, lm) in lead:
            if min(t + d, e) - max(t, s) <= 0:
                continue
            tot += 1
            iv = (m - lm) % 12
            if iv in (1, 11):
                semi += 1
            break
    return tot, semi


for ti in range(3):
    tot, semi = clashrate(old['tracks'][ti]['notes'])
    print('原曲 track%d  (%d 音, gain %.2f): 与新版主旋律同时发声音符 %d，其中半音撞车 %d = %.0f%%'
          % (ti, len(old['tracks'][ti]['notes']), old['tracks'][ti]['gain'], tot, semi, semi / max(tot, 1) * 100))

# 新版主旋律的空隙：主旋律静音的时间占比
dur = new['duration']


def silent_ratio(tr, min_gap=0.15):
    ns = sorted(tr['notes'], key=lambda n: n[0])
    busy = 0.0
    prev_end = 0.0
    for (t, m, d, v) in ns:
        s, e = t, t + d
        busy += max(0.0, e - max(s, prev_end))
        prev_end = max(prev_end, e)
    return 1 - busy / dur


print('新版主旋律静音时间占比 %.0f%%（这些空隙可以给原曲旋律应答）' % (silent_ratio(new['tracks'][0]) * 100))
print('新版 pad 静音占比 %.0f%%' % (silent_ratio(new['tracks'][3]) * 100))
