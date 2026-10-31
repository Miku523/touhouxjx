# -*- coding: utf-8 -*-
"""v2：把 8 条复盘意见落到 _rumia_compose.py。"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
P = os.path.join(ROOT, 'tools', 'build', '_rumia_compose.py')
s = open(P, encoding='utf-8').read()

def rep(old, new, n=1):
    global s
    c = s.count(old)
    assert c == n, 'anchor count %d != %d: %r' % (c, n, old[:80])
    s = s.replace(old, new)

# A 时长版图
rep("INTRO = 11.0\nBRIDGE = 10.0\nCODA = 10.75", "INTRO = 6.0\nBRIDGE = 10.0\nCODA = 6.5")

# B 增益
rep("""        ('lead', 'square', 0.325), ('piano', 'triangle', 0.068), ('harpsi', 'square', 0.115),
        ('strings', 'sawtooth', 0.095), ('choir', 'sine', 0.075), ('bass', 'triangle', 0.130),
        ('sub', 'sine', 0.045), ('bell', 'sine', 0.115), ('tick', 'square', 0.085),
        ('pad', 'sine', 0.075), ('counter', 'triangle', 0.060), ('guitar', 'sawtooth', 0.062),
        ('brass', 'square', 0.065), ('riser', 'sawtooth', 0.050), ('reverse', 'sawtooth', 0.045),""",
"""        ('lead', 'square', 0.325), ('piano', 'triangle', 0.062), ('harpsi', 'square', 0.163),
        ('strings', 'sawtooth', 0.150), ('choir', 'sine', 0.106), ('bass', 'triangle', 0.130),
        ('sub', 'sine', 0.080), ('bell', 'sine', 0.135), ('tick', 'square', 0.105),
        ('pad', 'sine', 0.106), ('counter', 'triangle', 0.085), ('guitar', 'sawtooth', 0.124),
        ('brass', 'square', 0.078), ('riser', 'sawtooth', 0.050), ('reverse', 'sawtooth', 0.045),""")

# C 鼓整体 -1dB
rep("int(max(1, min(127, vel * 0.85)))", "int(max(1, min(127, vel * 0.76)))")

# D 主旋律钢琴加倍减薄 + 玻璃点音
rep("""        add('lead', t, m, d * 0.96, min(127, int(v * 1.25)))
        add('piano', t, m, d * 0.7, int(v * 0.42))         # 原谱 ch4 钢琴同度加倍""",
"""        add('lead', t, m, d * 0.96, min(127, int(v * 1.25)))
        if d >= 0.10:                                     # 32 分跑动不再叠钢琴
            add('piano', t, m, d * 0.7, int(v * 0.32))     # 原谱 ch4 钢琴同度加倍
        if d >= 0.20 and m + 12 <= 100:
            add('bell', t, m + 12, 0.30, 34)               # 玻璃点音：稀疏高八度钟""")
rep("        add('piano', t, m, d * 0.9, int(v * 0.72))        # ch3 钢琴对句",
    "        add('piano', t, m, d * 0.9, int(v * 0.56))        # ch3 钢琴对句（降 vel 让主旋律露头）")
rep("        add('piano', t, m, d * 0.8, int(v * 0.5))         # ch14 低八度",
    "        add('piano', t, m, d * 0.8, int(v * 0.42))        # ch14 低八度")

# F 引子重写（6 秒，八音盒把主题哼满）
old_intro = """def intro():
    # 1) 低音 drone（pad）+ 暗色 choir
    for t0, dur, chord, gain_vel in ((0.0, 6.0, Ebm, 44), (5.6, 5.4, Gbmaj7, 40)):
        for i, m in enumerate(chord):
            add('pad', t0, m, dur, gain_vel - i * 3)
    add('choir', 3.2, 51, 7.6, 36)
    add('choir', 3.2, 58, 7.6, 30)
    for m in (51, 58, 63):
        add('strings', 0.0, m, 6.4, 42)
        add('strings', 5.6, m, 5.2, 38)
    # 2) 八音盒把主题头哼一遍（原曲主题首句，高八度）
    for off, m, d in THEME_HEAD:
        add('bell', 0.55 + off, m, d, 120 if off < 2 else 108)
    # 3) 钟摆与心跳
    for i in range(10):
        add('tick', 2.2 + i * 0.9, 92, 0.09, 30 if i % 2 else 40)
    for i in range(3):
        drum(0.0 + i * 3.2, 0, 78)
        drum(0.9 + i * 3.2, 0, 56)
    drum(9.2, 5, 88); drum(9.6, 5, 96); drum(10.0, 5, 104)
    add('riser', 9.0, 39, 2.0, 96)
    # 4) 管风琴把门推开
    for i, m in enumerate(Ebm):
        add('pad', 8.0, m, 3.0, 52 - i * 4)
    add('choir', 8.4, 63, 2.4, 40)"""
new_intro = """def intro():
    # 1) 低音 drone（pad）+ 暗色 choir + 薄弦
    for t0, dur, chord, gain_vel in ((0.0, 3.4, Ebm, 46), (3.0, 3.2, Gbmaj7, 40)):
        for i, m in enumerate(chord):
            add('pad', t0, m, dur, gain_vel - i * 3)
    add('choir', 0.6, 51, 5.4, 38)
    add('choir', 0.6, 58, 5.4, 32)
    for m in (51, 58, 63):
        add('strings', 0.0, m, 6.2, 40)
    # 2) 八音盒把主题哼满：主题首句 + 后半句（都在 0:00-0:06 里）
    for off, m, d in THEME_HEAD:
        add('bell', 0.10 + off, m, d, 127 if off < 2 else 118)
    for off, m, d, v in ((3.60, 75, 0.5, 112), (4.12, 78, 0.45, 108),
                         (4.60, 80, 0.5, 112), (5.10, 82, 0.55, 116), (5.62, 75, 0.4, 100)):
        add('bell', off, m, d, v)
    # 3) 钟摆与心跳（心跳降 3dB，把位置让给八音盒）
    for i in range(7):
        add('tick', 0.9 + i * 0.72, 92, 0.09, 44 if i % 2 else 56)
    for i in range(2):
        drum(0.0 + i * 2.4, 0, 66)
        drum(0.8 + i * 2.4, 0, 44)
    add('riser', 4.5, 39, 1.5, 90)
    # 4) 管风琴把门推开
    for i, m in enumerate(Ebm):
        add('pad', 4.9, m, 2.2, 54 - i * 4)
    add('choir', 5.0, 63, 1.5, 44)
    drum(5.4, 5, 88); drum(5.7, 5, 96)"""
rep(old_intro, new_intro)

# G 尾声重写（6.5 秒，补 drone 与心跳）
old_coda = """def coda(coda_t0, duration):
    # 回到八音盒：主题头 + 主题尾句，最后落在降 E
    for off, m, d in THEME_HEAD:
        add('bell', coda_t0 + 0.7 + off, m, d, 100)
    # 主题首句的后半（从原曲主题取音：Eb5 Gb5 Ab5 Bb5 Ab5 Gb5 Eb5）
    tail = [(4.6, 75, 0.6), (5.2, 78, 0.45), (5.65, 80, 0.5), (6.15, 82, 0.6),
            (6.75, 80, 0.45), (7.15, 78, 0.5), (7.6, 82, 1.4)]
    for off, m, d in tail:
        add('bell', coda_t0 + off, m, d, 88 if off < 7 else 100)
    for m in (39, 51, 58):
        add('pad', coda_t0 + 6.4, m, 3.4, 40)
    drum(coda_t0 + 8.4, 4, 62)
    for i in range(5):
        add('tick', coda_t0 + 1.4 + i * 1.5, 92, 0.08, 26)"""
new_coda = """def coda(coda_t0, duration):
    # 回到八音盒，但底下留 drone / 弦 / 心跳，别让循环点断气
    for off, m, d in THEME_HEAD:
        add('bell', coda_t0 + 0.30 + off, m, d, 100)
    tail = [(3.55, 75, 0.5), (4.00, 78, 0.4), (4.45, 80, 0.45), (4.90, 82, 0.5), (5.35, 75, 0.6)]
    for off, m, d in tail:
        add('bell', coda_t0 + off, m, d, 92)
    for m in (39, 46, 51):
        add('pad', coda_t0 + 0.0, m, 6.1, 40)
    add('choir', coda_t0 + 0.0, 51, 5.9, 32)
    add('strings', coda_t0 + 0.0, 51, 6.1, 36)
    for i in range(2):
        drum(coda_t0 + 0.2 + i * 2.6, 0, 52)
        drum(coda_t0 + 0.9 + i * 2.6, 0, 38)
    drum(coda_t0 + 5.9, 4, 54)
    for i in range(4):
        add('tick', coda_t0 + 0.6 + i * 1.4, 92, 0.08, 34)"""
rep(old_coda, new_coda)

# H 鼓组分层函数
shape = '''

def shape_drums(off1, var_t0, var_mid, coda_t0):
    """鼓组分层：风琴段留 8 分镲 + ride、铁琴段留一半镲 + ride、
       变奏 II 中段整段抽空 4.8 秒做半速呼吸；主题/变奏保持原谱密度。"""
    t_vib = 15.77 + off1
    t_theme = 28.27 + off1
    out = []
    hat_i = 0
    for ev in DRUMS:
        t, k = ev[0], ev[1]
        if INTRO <= t < t_vib:              # 风琴前奏：只留 8 分闭镲
            if k == 2:
                hat_i += 1
                if hat_i % 2 == 0:
                    continue
                ev = [t, k, int(ev[2] * 0.9)] + ev[3:]
            elif k == 3:                    # 开镲全撤
                continue
        elif t_vib <= t < t_theme:          # 铁琴过门：留另一组 8 分
            if k == 2:
                hat_i += 1
                if hat_i % 2 == 1:
                    continue
                ev = [t, k, int(ev[2] * 0.85)] + ev[3:]
        if var_mid - 0.02 <= t < var_mid + 4.8:
            continue                        # 变奏 II 呼吸
        out.append(ev)
    DRUMS[:] = out
    step = 60.0 / 144.0
    t = INTRO + step * 0.5
    while t < t_vib - 0.01:
        drum(t, 7, 30 if int((t - INTRO) / step) % 2 else 36)
        t += step
    t = t_vib + step
    while t < t_theme - 0.01:
        drum(t, 7, 34)
        t += step * 2
    drum(t_theme, 4, 74)
    drum(var_t0, 4, 78)
    drum(var_mid + 4.8, 4, 84)
'''
rep("\ndef fnum(x):", shape + "\ndef fnum(x):")

# I main：变奏 II 事件 + 尾声 + 鼓组分层
rep("""    # 尾声
    coda(coda_t0, duration)
    # 收尾：裁掉越界音""",
"""    # 变奏 II：中段抽成 4.8 秒半速呼吸，钢琴 32 分下行补位；回来后铜管加高八度
    var_mid = round(var_t0 + 13.75, 3)
    run = [99, 98, 96, 94, 92, 91, 89, 87, 86, 84, 82, 80, 79, 77, 75, 74]
    for i in range(int(4.6 / 0.052)):
        p = run[i % len(run)] - (i // len(run)) * 2
        add('piano', var_mid + 0.2 + i * 0.052, max(60, p), 0.10, max(40, 86 - (i % 4) * 3))
    add('riser', var_mid + 3.4, 63, 1.6, 92)
    add('reverse', var_mid + 4.2, 82, 0.7, 60)
    for ev in list(BY['lead']):
        if var_mid + 4.7 <= ev[0] < coda_t0 - 0.02 and ev[1] + 12 <= 100:
            add('brass', ev[0], ev[1] + 12, min(0.5, ev[2]), 54)
    # 尾声
    coda(coda_t0, duration)
    # 鼓组分层
    shape_drums(off1, var_t0, var_mid, coda_t0)
    # 收尾：裁掉越界音""")

# J reasons / 头注释
rep("'新写 11 秒引子：八音盒先把主题头哼一遍，暗色 drone、钟摆、心跳把红夜铺开'",
    "'新写 6 秒引子：八音盒把主题首句与后半句一起哼完（0:00 就听得出是谁的曲子），心跳与钟摆垫底'")
rep("'尾声回到八音盒，最后停在降 E 上接回引子（循环点）'",
    "'尾声 6.5 秒：八音盒主题尾句 + drone / 弦 / 心跳垫底，停在降 E 上接回引子（循环点不断气）'")
rep("* 新增引子 / 黑暗桥段 / 主题变奏 / 尾声。", "* 新增 6 秒引子 / 黑暗桥段 / 主题变奏 II / 6.5 秒尾声。")

open(P, 'w', encoding='utf-8', newline='').write(s)
print('patched', P)
