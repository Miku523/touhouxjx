# -*- coding: utf-8 -*-
"""融合稿 v3：把原曲两条旋律层「对位改写到新编曲的和声里」再叠进去。

用户反馈（m00836）：「叠加冲突的太多了」。上一版只删了与主旋律差 0/1/11 半音的音，
但原曲旋律本身是旧和声写的，进到新编曲的进行里仍然不断踩到不属于当前和弦的音。

这一版做三件事：
1. **和弦吸附**：按新编曲逐小节的和弦（直接调 aya_stage4.prog_at），把原曲音符
   微调到最近的弦内音（最多 ±2 半音，再远就删）；
2. **对位去撞**：与新版主旋律（0/1/11 半音）或另一条原曲旋律撞车就删；
3. **降为副声部**：原曲主奏 0.15→0.06、副旋律 0.05→0.04。
"""
import json
import os
import sys

BASE = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(BASE, 'tools'))
import aya_stage4 as A          # 只为了拿 prog_at / CHORDS（模块级 build 不写文件）

BAR = 240.0 / 154
OUT = os.path.join(BASE, 'src', 'engine', 'songs', 'aya_stage4_fx.js')

new = json.load(open(os.path.join(BASE, 'tools', 'build', '_aya_fb.json'), encoding='utf-8'))
old = json.load(open(os.path.join(BASE, 'tools', 'build', '_old_stage4.json'), encoding='utf-8'))
duration = new['duration']
lead = [(t, t + d, m) for (t, m, d, v) in new['tracks'][0]['notes']]


def allowed(bar):
    ch = A.prog_at(bar)
    root, tpl = A.CHORDS[ch]
    return {(root + iv) % 12 for iv in tpl if iv < 12}, ch


def snap(m, bar, max_shift=2):
    """把音高微调到弦内音，返回 (新音高 或 None, 改名标记)"""
    ok, _ = allowed(bar)
    if m % 12 in ok:
        return m, False
    for k in (1, -1, 2, -2):
        if abs(k) > max_shift:
            continue
        if (m + k) % 12 in ok:
            return m + k, True
    return None, False


def clash_with(m, t, d, pool, drop_in=(0, 1, 11)):
    for (s, e, pm) in pool:
        if min(t + d, e) - max(t, s) <= 0:
            continue
        if (m - pm) % 12 in drop_in:
            return True
    return False


kept_all = []
stats = {}


def clean(layer, gain, name):
    out = []
    snapped = dropped = 0
    for (t, m, d, v) in layer:
        if t >= duration - 1e-6:
            continue
        bar = int(t / BAR)
        mm, did = snap(m, bar)
        if mm is None:
            dropped += 1
            continue
        snapped += did
        if clash_with(mm, t, d, lead) or clash_with(mm, t, d, kept_all):
            dropped += 1
            continue
        out.append([round(t, 4), int(mm), round(min(d, 2.0), 4), int(v)])
        kept_all.append((t, t + d, mm))
    stats[name] = (len(layer), len(out), snapped, dropped)
    print('  %s: 原 %d → 留 %d（吸附 %d，删 %d）' % (name, len(layer), len(out), snapped, dropped))
    return {'wave': 'square', 'gain': gain, 'notes': out}


print('对位改写原曲旋律层：')
t0 = clean(old['tracks'][0]['notes'], 0.060, 'aya8a')
t2 = clean(old['tracks'][2]['notes'], 0.040, 'aya8b')

tracks = [dict(new['tracks'][i]) for i in range(4)] + [t0, t2]
for tr in tracks:
    ns = sorted(tr['notes'], key=lambda n: (n[0], -n[1]))
    out = []
    for n in ns:
        if out and abs(n[0] - out[-1][0]) < 1e-6:
            if n[1] > out[-1][1]:
                out[-1] = n
            continue
        if out and out[-1][0] + out[-1][2] > n[0]:
            out[-1][2] = round(max((n[0] - out[-1][0]) * 0.97, 0.03), 4)
        out.append(n)
    tr['notes'] = out

song = {'title': '風神少女', 'duration': duration, 'bpm': new['bpm'],
        'tracks': tracks, 'drums': new['drums']}
with open(OUT, 'w', encoding='utf-8') as f:
    f.write('export const AYA_STAGE4 = '
            + json.dumps({'stage4': song}, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('写入', OUT)
print('轨:', [(t['wave'], t['gain'], len(t['notes'])) for t in tracks], '鼓', len(song['drums']))
