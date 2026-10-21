# -*- coding: utf-8 -*-
"""融合稿 v2（「叠加稿改一改」）：把游戏内 8bit 原曲的两条旋律层
经过对位清理后，直接加进新编曲，做成一份真正的合奏谱。

清理规则（每一处都是让两层旋律不打架）：
1. 原曲音符与新编曲主旋律同时发声、且相距 1 或 11 个半音 → 删（这就是刺耳来源）；
2. 与新编曲主旋律完全同音（相距 0）→ 删（避免硬 double，方波叠方波会变毛）；
3. 原曲 track0 音量 0.15 → 0.075、track2 0.05 → 0.045，让它当「第二声部」而不是第二个主奏；
4. 原曲贝斯轨整条丢弃（和新版贝斯 22% 半音撞车，低频会糊）。

输出 6 轨：lead / wind / bass / pad（全是新版）+ aya8a / aya8b（原曲两条旋律）。
"""
import json
import os

BASE = r'C:\Users\GuSheng\Downloads\HKS'
OUT = os.path.join(BASE, 'src', 'engine', 'songs', 'aya_stage4_fx.js')

new = json.load(open(os.path.join(BASE, 'tools', 'build', '_aya_fb.json'), encoding='utf-8'))
old = json.load(open(os.path.join(BASE, 'tools', 'build', '_old_stage4.json'), encoding='utf-8'))

duration = new['duration']
lead = [(t, t + d, m) for (t, m, d, v) in new['tracks'][0]['notes']]


def clash(m, t, d):
    for (s, e, lm) in lead:
        if min(t + d, e) - max(t, s) <= 0:
            continue
        iv = (m - lm) % 12
        if iv in (0, 1, 11):
            return True
    return False


def clean(layer, gain):
    kept, dropped = [], 0
    for (t, m, d, v) in layer:
        if t >= duration - 1e-6:
            continue
        if clash(m, t, d):
            dropped += 1
            continue
        kept.append([round(t, 4), int(m), round(min(d, 2.0), 4), int(v)])
    print('  保留 %d / 删 %d' % (len(kept), dropped))
    return {'wave': 'square', 'gain': gain, 'notes': kept}


print('清理原曲 track0：')
t0 = clean(old['tracks'][0]['notes'], 0.075)
print('清理原曲 track2：')
t2 = clean(old['tracks'][2]['notes'], 0.045)

tracks = [dict(new['tracks'][i]) for i in range(4)] + [t0, t2]
# 保持单声部
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

song = {
    'title': '風神少女',
    'duration': duration,
    'bpm': new['bpm'],
    'tracks': tracks,
    'drums': new['drums'],
}
body = json.dumps({'stage4': song}, ensure_ascii=False, separators=(',', ':'))
with open(OUT, 'w', encoding='utf-8') as f:
    f.write('export const AYA_STAGE4 = ' + body + ';\n')
print('写入', OUT)
print('轨:', [(t['wave'], t['gain'], len(t['notes'])) for t in tracks])
print('鼓', len(song['drums']))
