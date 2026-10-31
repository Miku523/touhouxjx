# -*- coding: utf-8 -*-
"""v2b：让变奏 II 的 4.8 秒呼吸真的空出来（只留钢琴跑动 + drone + 心跳）。"""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
P = os.path.join(ROOT, 'tools', 'build', '_rumia_compose.py')
s = open(P, encoding='utf-8').read()
old = """    for ev in list(BY['lead']):
        if var_mid + 4.7 <= ev[0] < coda_t0 - 0.02 and ev[1] + 12 <= 100:
            add('brass', ev[0], ev[1] + 12, min(0.5, ev[2]), 54)
"""
new = """    for ev in list(BY['lead']):
        if var_mid + 4.7 <= ev[0] < coda_t0 - 0.02 and ev[1] + 12 <= 100:
            add('brass', ev[0], ev[1] + 12, min(0.5, ev[2]), 54)
    # 变奏 II 呼吸：除钢琴跑动、drone、心跳外全部撤掉（鼓由 shape_drums 抽）
    _keep = ('piano', 'pad', 'tick', 'riser', 'reverse')
    for _nm in list(BY):
        if _nm in _keep:
            continue
        BY[_nm][:] = [n for n in BY[_nm] if not (var_mid - 0.02 <= n[0] < var_mid + 4.8)]
    for _m in (39, 46, 51):
        add('pad', var_mid, _m, 4.8, 44)
    for _i in range(4):
        add('tick', var_mid + 0.4 + _i * 1.1, 92, 0.09, 50)
"""
assert s.count(old) == 1
s = s.replace(old, new)
open(P, 'w', encoding='utf-8', newline='').write(s)
print('patched v2b')
