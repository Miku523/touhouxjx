# -*- coding: utf-8 -*-
import json, collections
# ---- 原曲 ----
src = json.load(open('tools/build/_pret_ref/necrofantasia/midi_flat.json', encoding='utf-8'))
notes = src['notes']
print('orig bars total', max(n['bar'] for n in notes)+1, 'bpm', src.get('bpm'))
sub = [n for n in notes if 2 <= n['bar'] <= 17]
print('orig bars2-17 note count', len(sub))
per = collections.Counter(n['ch'] for n in sub)
print('per ch:', dict(sorted(per.items())))
# 每 ch 音域 / 力度
for ch in sorted(per):
    ns = [n for n in sub if n['ch']==ch]
    print(' ch%02d n=%3d midi %3d-%3d vel %3d-%3d dur.mean %.3f' % (ch, len(ns), min(x['m'] for x in ns), max(x['m'] for x in ns), min(x['v'] for x in ns), max(x['v'] for x in ns), sum(x['d'] for x in ns)/len(ns)))
# 同刻叠音深度（按 t 四舍五入 1/48 拍）
grid = collections.Counter()
for n in sub:
    grid[(n['ch'], round(n['t']*48))] += 1
# 各 ch 是否有同刻重复
print('ch with same-time duplicates:', {c: sum(1 for (cc,_),v in grid.items() if cc==c and v>1) for c in sorted(per)})
# ---- 我们的 ----
js = open('src/engine/songs/yukari_ph.js', encoding='utf-8').read()
i = js.index('{', js.index('ph_boss'))
data = json.loads(js[i:js.rindex('}')+1])
tr = data['tracks']
bar = 60.0/172*4
# A 段 = 我们的小节 7..22 (0 基?)
print('bars', data.get('bpm'), data.get('duration'))
