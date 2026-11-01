# -*- coding: utf-8 -*-
"""tools/build/_pret_lead/_mix2.py —— 第二轮：pre1 C 段收、鼓组补密度、pre3 尾接缝+亮度、pre4 主奏收"""
import os, io
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
B = os.path.join(ROOT, 'tools', 'build')

def edit(fn, pairs):
    p = os.path.join(B, fn)
    s = io.open(p, encoding='utf-8').read()
    for old, new, cnt in pairs:
        c = s.count(old)
        assert c == cnt, (fn, old[:60], c, cnt)
        s = s.replace(old, new)
    io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
    print('patched', fn)

# ---- pre1：C 段收 + 低频补 + 鼓组 ghost 层
edit('_pret1_compose.py', [
    ("'C': 0.96,", "'C': 0.90,", 1),
    ("s.add('lead', t, n['m'], n['d'], n['v'] * 0.48)", "s.add('lead', t, n['m'], n['d'], n['v'] * 0.34)", 1),
    ("s.add('bell', t, n['m'] + 12, max(0.10, n['d'] * 0.9), n['v'] * 0.22)", "s.add('bell', t, n['m'] + 12, max(0.10, n['d'] * 0.9), n['v'] * 0.16)", 1),
    ("('bass',    'triangle', 0.165)", "('bass',    'triangle', 0.185)", 1),
    ("('sub',     'sine',     0.075)", "('sub',     'sine',     0.090)", 1),
    ("    # ---------- 引子（新 1-2）：夜樱 ----------", """    # 鼓组 ghost 层：给主段补密度与推进感（底鼓反拍 + 十六分 ghost 军鼓）
    for b in range(15, 55):
        s.drum(s.bt(b, 2.5), 0, 88)
        s.drum(s.bt(b, 3.5), 0, 84)
        for k in (1.75, 3.75):
            s.drum(s.bt(b, k), 1, 58)
        if b % 2 == 1:
            s.drum(s.bt(b, 3.25), 6, 74)

    # ---------- 引子（新 1-2）：夜樱 ----------""", 1),
])

# ---- pre3：尾接缝（pad 收短）+ 提亮
edit('_pret3_compose.py', [
    ("    for i, m in enumerate((r1, r1 + 7, r1 + 12, r1 + 15)):\n        s.add('pad', s.bt(55), m, 8.0 * s.beat * 0.98, 48 - i * 4)",
     "    for i, m in enumerate((r1, r1 + 7, r1 + 12, r1 + 15)):\n        s.add('pad', s.bt(55), m, 6.4 * s.beat, 48 - i * 4)", 1),
    ("s.add('sub', s.bt(55), r1 - 12, 8.0 * s.beat * 0.96, 58)", "s.add('sub', s.bt(55), r1 - 12, 6.4 * s.beat, 58)", 1),
    ("s.add('choir', s.bt(55), r1 + 24, 8.0 * s.beat * 0.9, 28)", "s.add('choir', s.bt(55), r1 + 24, 6.0 * s.beat, 28)", 1),
    ("('piano',   'triangle', 0.145)", "('piano',   'triangle', 0.170)", 1),
    ("('harpsi',  'square',   0.190)", "('harpsi',  'square',   0.235)", 1),
    ("('strings', 'sawtooth', 0.190)", "('strings', 'sawtooth', 0.200)", 1),
    ("('bell',    'sine',     0.130)", "('bell',    'sine',     0.150)", 1),
])

# ---- pre4：A2/C2 长笛主奏收
edit('_pret4_compose.py', [
    ("3:  [('lead', 0, 0.55, 1.0), ('bell', 12, 0.18, 0.9)]", "3:  [('lead', 0, 0.34, 1.0), ('bell', 12, 0.16, 0.9)]", 1),
    ("12: [('lead', 0, 0.50, 1.0)]", "12: [('lead', 0, 0.28, 1.0)]", 1),
])
print('OK')
