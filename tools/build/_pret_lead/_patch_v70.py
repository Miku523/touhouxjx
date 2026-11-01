# -*- coding: utf-8 -*-
"""v1.6.70 全改：五首道中曲后处理补丁（只改 composer，不动音频）。"""
import io, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
BUILD = os.path.join(ROOT, 'tools', 'build')

IMP_OLD = 'from _pret_engine import Eng'
IMP_NEW = ("from _pret_engine import Eng\n"
           "from _pret_post import (copy_layer, copy_shift, sub_pedal, tick_accents,\n"
           "                        crash_heads, add_ride, thin_crashes, thin_kind)")

POST = {
 'pre1': '''
    # ================= v1.6.70 全改 =================
    _s = eng.song
    # (6) A 段织体：弦乐同度齐奏 + 铜管和声
    copy_layer(_s, 'lead', 'strings', 15, 30, shift=0, vmul=0.55)
    copy_layer(_s, 'lead', 'brass', 15, 30, shift=0, vmul=0.42)
    # (1) C 段主奏（钢琴十六分）再叠八音盒高八度
    copy_layer(_s, 'lead', 'bell', 39, 46, shift=12, vmul=0.30, hi=100)
    # (2) 低频踏板
    sub_pedal(_s, vel=66)
    # (9) 点音铺开
    tick_accents(_s, [(3, 0), (15, 0), (31, 0), (39, 0), (47, 0), (51, 0), (55, 0)])
    crash_heads(_s, [(15, 0), (31, 0), (39, 0), (47, 0), (51, 0)], vel=84)
''',
 'pre2': '''
    # ================= v1.6.70 全改 =================
    _s = eng.song
    # (1) 主语 hook 提前预演：A 段开头那句（bar 14-17）搬到 6.4s 与 12.0s
    copy_shift(_s, 'lead', 'bell', 14, 17, 6.4, shift=0, vmul=0.85, hi=100)
    copy_shift(_s, 'lead', 'lead', 14, 17, 6.4, shift=-12, vmul=0.50, hi=100)
    copy_shift(_s, 'lead', 'bell', 14, 16, 12.0, shift=0, vmul=0.70, hi=100)
    # (2) 低频踏板
    sub_pedal(_s, vel=64)
    # (4) 打击色彩：ride 铺开 + 段头吊镲
    add_ride(_s, 14, 52, beats=(0.0, 1.0, 2.0, 3.0), vel=44)
    add_ride(_s, 61, 68, beats=(0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5), vel=48)
    crash_heads(_s, [(5, 0), (53, 0), (61, 0), (69, 0)], vel=82)
    # (9) 点音铺开
    tick_accents(_s, [(5, 0), (53, 0), (61, 0), (69, 0)])
''',
 'pre3': '''
    # ================= v1.6.70 全改 =================
    _s = eng.song
    # (5) B1 段补合唱层
    copy_layer(_s, 'strings', 'choir', 19, 34, shift=0, vmul=0.55)
    # (1) C 段八音盒点音补厚
    copy_layer(_s, 'lead', 'bell', 39, 50, shift=12, vmul=0.32, hi=100)
    # (2) 低频踏板
    sub_pedal(_s, vel=64)
    # (9) 点音铺开
    tick_accents(_s, [(3, 0), (11, 0), (19, 0), (35, 0), (39, 0), (51, 0), (55, 0)])
    crash_heads(_s, [(3, 0), (19, 0), (39, 0), (51, 0)], vel=80)
''',
 'pre4': '''
    # ================= v1.6.70 全改 =================
    _s = eng.song
    # (3) 镲片稀疏化：656 击 -> 约 1/3
    thin_crashes(_s, keep_mod=3)
    add_ride(_s, 3, 82, beats=(0.0, 1.0, 2.0, 3.0), vel=46)
    # (3) C1 闭镲稀疏 1/4，与 C2 密度靠拢
    thin_kind(_s, 2, 41, 54, mod=4)
    # (3) C1 补铜管和声（与 C2 一致）
    copy_layer(_s, 'lead', 'brass', 41, 54, shift=0, vmul=0.45, hi=100)
    # (8) C2 变化：旋律八度加层
    copy_layer(_s, 'lead', 'lead', 55, 70, shift=12, vmul=0.32, hi=100)
    # (2) 低频踏板
    sub_pedal(_s, vel=66)
    # (9) 点音铺开
    tick_accents(_s, [(3, 0), (17, 0), (33, 0), (41, 0), (55, 0), (71, 0), (83, 0)])
    crash_heads(_s, [(3, 0), (17, 0), (33, 0), (41, 0), (55, 0), (71, 0)], vel=88)
''',
 'pre6': '''
    # ================= v1.6.70 全改 =================
    _s = eng.song
    # (7) 3/4 段打点 + 转 B 大调段的铜管和声
    add_ride(_s, 27, 42, beats=(0.0, 1.0, 2.0), vel=44)
    copy_layer(_s, 'lead', 'brass', 43, 58, shift=0, vmul=0.45, hi=93)
    crash_heads(_s, [(27, 0), (43, 0), (51, 0), (59, 0)], vel=84)
    # (2) 低频踏板
    sub_pedal(_s, vel=66)
    # (9) 点音铺开
    tick_accents(_s, [(3, 0), (27, 0), (43, 0), (59, 0)])
''',
}

GAINS = {
 'pre1': [("('strings', 'sawtooth', 0.195)", "('strings', 'sawtooth', 0.230)")],
 'pre2': [("('piano',   'triangle', 0.245)", "('piano',   'triangle', 0.300)"),
          ("('harpsi',  'square',   0.400)", "('harpsi',  'square',   0.520)"),
          ("('strings', 'sawtooth', 0.280)", "('strings', 'sawtooth', 0.350)")],
 'pre3': [("('harpsi',  'square',   0.235)", "('harpsi',  'square',   0.320)"),
          ("('strings', 'sawtooth', 0.200)", "('strings', 'sawtooth', 0.245)")],
 'pre6': [("('lead',    'square',   0.330)", "('lead',    'square',   0.350)"),
          ("('piano',   'triangle', 0.085)", "('piano',   'triangle', 0.070)"),
          ("    ('tick',    'square',   0.090),", "    ('tick',    'square',   0.090),\n    ('brass',   'square',   0.150),")],
}

ANCHOR = {
 'pre1': '    song = eng.write()',
 'pre2': '    eng.write()',
 'pre3': '    eng.write()',
 'pre4': '    eng.write()',
 'pre6': '    eng.write()',
}

for name, post in POST.items():
    p = os.path.join(BUILD, '_pret' + name[3:] + '_compose.py')
    src = io.open(p, encoding='utf-8').read().replace('\r\n', '\n')
    if 'from _pret_post import' not in src:
        assert src.count(IMP_OLD) == 1, name
        src = src.replace(IMP_OLD, IMP_NEW)
    for a, b in GAINS.get(name, []):
        assert src.count(a) == 1, (name, a)
        src = src.replace(a, b)
    anc = ANCHOR[name]
    if 'v1.6.70 全改' not in src:
        assert src.count(anc) == 1, (name, 'anchor', src.count(anc))
        src = src.replace(anc, post + anc)
    io.open(p, 'w', encoding='utf-8', newline='\n').write(src)
    print('patched', name)
