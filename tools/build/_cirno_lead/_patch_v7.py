# -*- coding: utf-8 -*-
"""v7 全改：落实 9 条优化（B/B2 低频、副歌二段变奏、C 段收并补织体、动态层次、
counter 提升、副歌鼓组统一、冰晶彩头铺开、引子压缩、尾声加强）"""
import io

P = 'tools/build/_cirno_compose.py'
src = io.open(P, encoding='utf-8').read()


def span(start, end, new):
    global src
    i = src.index(start)
    j = src.index(end, i)
    src = src[:i] + new + src[j:]


def sub(old, new, cnt=1):
    global src
    assert src.count(old) == cnt, (src.count(old), old[:70])
    src = src.replace(old, new)


# ---------------------------------------------------------------- 增益
sub("    ('counter', 'triangle', 0.118),   # 第二旋律 / 长音对答",
    "    ('counter', 'triangle', 0.190),   # 第二旋律 / 长音对答")
sub("    ('bell', 'sine', 0.130),          # 八音盒 / 切莱斯塔 / 冰晶",
    "    ('bell', 'sine', 0.142),          # 八音盒 / 切莱斯塔 / 冰晶")
sub("    ('tick', 'square', 0.085),", "    ('tick', 'square', 0.070),")

# ---------------------------------------------------------------- 引子 I
span("def intro1():", "# ------------------------------------------------------------------ 引子 II", '''def intro1():
    # 冰面 pad：D 大调 → Bm → A7
    pad_chord(1, [50, 57, 62, 66], 8.0, 38)
    pad_chord(3, [47, 54, 59, 62], 4.0, 34)
    pad_chord(4, [45, 52, 57, 61], 2.0, 30)   # A7
    for b in (1, 2):
        add('choir', bt(b, 0), 62, 2.0 * BEAT, 26)
    # 冰原风声（原来前 5 秒只有 pad 16 音，太空）
    add('reverse', bt(1, 0.0), 74, 1.4, 36)
    add('pad', bt(1, 0.0), 74, 2.6, 24)
    add('pad', bt(2, 0.0), 78, 2.0, 18)
    # 心跳（第一小节让过循环点，从第 2 拍进）
    for b in range(1, 5):
        dr_kick(b, 0.5 if b == 1 else 0.0, 52); dr_kick(b, 2.5, 38)
    # 钟摆
    for b in range(1, 5):
        for k in (0.5, 1.5, 2.5, 3.5) if b == 1 else (0.0, 1.0, 2.0, 3.0):
            add('tick', bt(b, k), 93, 0.10, 34)
    # 冰晶八音盒
    ice = [86, 90, 93, 98, 93, 90, 86, 90]
    for i, m in enumerate(ice):
        add('bell', bt(1, 0.5 + i * 0.5), m, 0.28, 30 + i)
    sparkle_run(4, [86, 90, 93, 98, 102], 0.125, 26, 0.9, 'arp')
    # 恋娘 A 动机提前到 1.5 秒（原来要等到 9.29s 才听到）
    for n in melody_top(src_notes('girl', 4, 5, {7})):
        t = bt(2, 0.5) + (n['bar'] - 4) * BAR + n['beat'] * BEAT
        add('bell', t, n['m'], min(0.34, n['db'] * BEAT), 92)
        if n['m'] + 12 <= 104:
            add('bell', t, n['m'] + 12, 0.18, 42)
    # 数拍 1-2-3-4（升调）
    for i, m in enumerate([74, 76, 78, 81]):
        add('bell', bt(3, i), m, 0.24, 58 + i * 6)
        add('tick', bt(3, i), m + 12, 0.10, 40)
    # バカ 挑拨动机
    add('knife', bt(4, 2.0), 84, 0.20, 52)
    add('knife', bt(4, 2.5), 82, 0.18, 46)
    dr_roll(4, 2.0, 2.0, 40, 112)
    add('riser', bt(4, 0.0), 62, 2.0, 44)
    add('reverse', bt(4, 3.0), 74, 0.8, 40)
    # 冲击
    drum(bt(4, 3.5), 4, 96)
    drum(bt(4, 3.5), 0, 112)
    for m in (50, 57, 62, 66):
        add('brass', bt(4, 3.5), m, 0.5 * BEAT, 88)


''')

# ---------------------------------------------------------------- B / B' 补低频 + 对旋律抬高
span("def sec_b(b0, s0, nb, build=False):", "# ------------------------------------------------------------------ C 段", '''def sec_b(b0, s0, nb, build=False):
    mel = src_notes('girl', s0, s0 + nb - 1, {3})
    arp = src_notes('girl', s0, s0 + nb - 1, {8})
    gtr = src_notes('girl', s0, s0 + nb - 1, {4})
    pad = src_notes('girl', s0, s0 + nb - 1, {6})
    low = src_notes('girl', s0, s0 + nb - 1, {5})
    bass = src_notes('girl', s0, s0 + nb - 1, {1})
    for n in mel:
        t = place_t(n, s0, b0)
        add('lead', t, n['m'], n['db'] * BEAT * 0.92, min(127, int(n['v'] * 1.12)))
        add('piano', t, n['m'], n['db'] * BEAT * 0.9, int(n['v'] * 0.5))
        if n['m'] + 12 <= 102:
            add('bell', t, n['m'] + 12, 0.22, int(n['v'] * 0.26))
    for n in arp:
        t = place_t(n, s0, b0)
        add('harpsi', t, n['m'], n['db'] * BEAT * 0.8, int(n['v'] * 0.40))
        add('arp', t, n['m'], n['db'] * BEAT * 0.6, int(n['v'] * 0.30))
    for n in gtr:
        t = place_t(n, s0, b0)
        add('strings', t, n['m'], n['db'] * BEAT * 0.8, int(n['v'] * 0.34))
    for n in pad:
        t = place_t(n, s0, b0)
        add('strings', t, n['m'], n['db'] * BEAT * 0.95, int(n['v'] * 0.38))
        add('choir', t, n['m'], n['db'] * BEAT * 0.95, int(n['v'] * 0.22))
    for n in low:
        t = place_t(n, s0, b0)
        # 对旋律抬八度 + 提力度（原来 med 50 被贝斯埋掉，实测 -29dB 听不见）
        mm = n['m'] + 12 if n['m'] + 12 <= 98 else n['m']
        add('counter', t, mm, n['db'] * BEAT * 0.9, int(n['v'] * 0.48))
    for n in bass:
        t = place_t(n, s0, b0)
        add('bass', t, n['m'], n['db'] * BEAT * 0.9, min(127, int(n['v'] * 1.05)))
        add('sub', t, n['m'] - 12, n['db'] * BEAT * 0.9, int(n['v'] * 0.42))
    # 原曲 B 段没有贝斯轨（实测 bass -66dB）：按每小节最低音补 8 分反拍贝斯 + sub
    for b in range(b0, b0 + nb):
        sb = s0 + (b - b0)
        pcs = [n['m'] for n in src_notes('girl', sb, sb, {1, 2, 3, 4, 5, 6, 7, 8})]
        root = (min(pcs) if pcs else 50) - 12
        if root < 28:
            root += 12
        for i in range(8):
            mm = root + (12 if i % 4 == 3 else 0)
            add('bass', bt(b, i * 0.5), mm, BEAT * 0.42, 104 if i % 2 == 0 else 88)
            add('sub', bt(b, i * 0.5), mm - 12, BEAT * 0.42, 46)
    for b in range(b0, b0 + nb):
        dr_four(b, 108, 100, 38, 52, clap=48)
        pad_chord(b, [50, 53, 57, 62], 4.0, 22)
    if build:
        for b in range(b0, b0 + nb):
            for k in (0.0, 1.0, 2.0, 3.0):
                add('brass', bt(b, k), 50, BEAT * 0.7, 62)
        dr_roll(b0 + nb - 1, 2.0, 2.0, 50, 120)
        add('riser', bt(b0 + nb - 1, 0.0), 62, 4.0, 46)


''')

# ---------------------------------------------------------------- C 段：收 bass + 补 arp16 + 冰晶
span("def sec_c(b0, s0, nb=8, hero=False):", "# ------------------------------------------------------------------ D 段", '''def sec_c(b0, s0, nb=8, hero=False):
    riff = src_notes('adventure', s0, s0 + nb - 1, {7})
    organ = src_notes('adventure', s0, s0 + nb - 1, {2})
    strings = src_notes('adventure', s0, s0 + nb - 1, {4})
    bass = src_notes('adventure', s0, s0 + nb - 1, {5})
    for n in riff:
        t = place_t(n, s0, b0)
        m = n['m'] + 4
        add('lead', t, m, n['db'] * BEAT * 0.92, min(127, int(n['v'] * (1.16 if hero else 1.08))))
        if m + 12 <= 104:
            add('bell', t, m + 12, min(0.28, n['db'] * BEAT), int(n['v'] * 0.28))
            add('lead', t, m + 12, n['db'] * BEAT * 0.85, int(n['v'] * 0.30))
    for n in organ:
        t = place_t(n, s0, b0)
        add('harpsi', t, n['m'] + 4, n['db'] * BEAT * 0.8, int(n['v'] * 0.40))
        add('arp', t, n['m'] + 4, n['db'] * BEAT * 0.6, int(n['v'] * 0.26))
    for n in strings:
        t = place_t(n, s0, b0)
        add('strings', t, n['m'] + 4, n['db'] * BEAT * 0.95, int(n['v'] * 0.42))
        add('choir', t, n['m'] + 4, n['db'] * BEAT * 0.95, int(n['v'] * 0.24))
    for n in bass:
        t = place_t(n, s0, b0)
        # C 段 bass 原来是全曲最响的低音（-20.4，比主旋律还高）：收 1.5~2dB
        add('bass', t, n['m'] + 4, n['db'] * BEAT * 0.9, min(127, int(n['v'] * 0.84)))
        add('sub', t, n['m'] - 8, n['db'] * BEAT * 0.9, int(n['v'] * 0.32))
    for b in range(b0, b0 + nb):
        dr_four(b, 112, 104, 44, 58, clap=58, ride=(30 if hero else 0))
        pad_chord(b, [50, 53, 57, 62] if b % 2 else [50, 53, 58, 62], 4.0, 24)
        # 原曲此段没有 ch2 织体：补 16 分电流琶音 + 冰晶点缀，让 C 段不再只是「低频轰」
        for i in range(16):
            mm = [50, 53, 57][i % 3] + (12 if (i // 3) % 2 else 0) + 12
            add('arp', bt(b, i * 0.25), mm, 0.10, 36 if i % 4 == 0 else 26)
        add('bell', bt(b, 3.5), 93, 0.20, 34)
    drum(bt(b0, 0), 4, 96)


''')

# ---------------------------------------------------------------- 副歌：第二遍改编 + 鼓组统一
span("def chorus(b0, hero=False, counter_riff=False):", "# ------------------------------------------------------------------ 收束", '''def chorus(b0, hero=False, counter_riff=False):
    # 主旋律：第二遍做改编（前半加四度叠置与铜管呼应，后半整体升八度）
    for (bar, beat, m, db, v) in CH_HOOK:
        t = bt(b0 + bar, beat)
        up = 12 if (hero and bar >= 4) else 0
        mm = m + up
        add('lead', t, mm, db * BEAT * 0.95, min(127, int(v * (1.08 if hero else 0.98))))
        if mm + 12 <= 104:
            add('bell', t, mm + 12, min(0.3, db * BEAT), int(v * (0.44 if hero else 0.30)))
        if hero:
            if bar < 4:
                if m + 5 <= 100:
                    add('brass', t, m + 5, db * BEAT * 0.9, int(v * 0.40))
                add('lead', t, m + 12 if m + 12 <= 104 else m, db * BEAT * 0.9, int(v * 0.38))
            else:
                add('strings', t, mm, db * BEAT * 0.9, int(v * 0.42))
                add('piano', t, mm + 12 if mm + 12 <= 104 else mm, db * BEAT * 0.9, int(v * 0.34))
        else:
            add('lead', t, m + 12 if m + 12 <= 104 else m, db * BEAT * 0.88, int(v * 0.26))
        add('piano', t, m - 12 if m - 12 >= 33 else m, db * BEAT * 0.95, int(v * 0.44))
    # 和弦 + 反拍贝斯 + 鼓
    for i in range(8):
        bar = b0 + i
        ch = CH_HARM[i]
        for m in ch:
            add('piano', bt(bar, 0), m, 3.6 * BEAT, 52)
            add('strings', bt(bar, 0), m + 12, 3.6 * BEAT, 34)
        add('choir', bt(bar, 0), ch[0] + 12, 4.0 * BEAT * 0.95, 34)
        bass_offbeat(bar, ch[0] - 12, 116 if hero else 108)
        # 完美教室式十六分电流琶音
        for k in range(16):
            mm = ch[k % 3] + 12 + (12 if (k // 3) % 2 else 0)
            add('arp', bt(bar, k * 0.25), mm, 0.10, 40 if k % 4 == 0 else 30)
        if not hero:
            for off in (0.0, 2.5):
                add('brass', bt(bar, off), ch[0] + 12, 0.45, 78)
            add('choir', bt(bar, 2.0), ch[1] + 12, 2.0 * BEAT, 32)
        elif i < 4:
            # 铜管回声：回答主旋律
            add('brass', bt(bar, 3.5), ch[0] + 12, 0.30, 66)
        # 两遍副歌鼓组统一（原来 C1 没有 ride，15.4 击/s 对 21.5 击/s）
        dr_four(bar, 114 if hero else 112, 106, 48 if hero else 46, 60,
                clap=(64 if hero else 58), ride=(34 if hero else 30),
                crash=(96 if i in (0, 4) else 0))
        if hero and i >= 6:
            for k in range(16):
                drum(bt(bar, k * 0.25), 2, 30 if k % 4 else 38)
            for k in (1.5, 3.5):
                drum(bt(bar, k), 0, 104)
        # 数拍喊话：每两小节一记上行四音
        if i % 2 == 0:
            for k, mm2 in enumerate([74, 77, 81, 86]):
                add('bell', bt(bar, k * 0.5), mm2, 0.18, 74)
    # 段尾推进
    dr_roll(b0 + 7, 2.5, 1.5, 50, 120)
    add('riser', bt(b0 + 7, 0.0), 62, 4.0, 44)
    # 冒険 riff 对答（第二遍副歌）
    if counter_riff:
        riff = src_notes('adventure', 7, 10, {7})
        for n in riff:
            t = place_t(n, 7, b0 + 4)
            mm = n['m'] + 16 if n['m'] + 16 <= 98 else n['m'] + 4
            add('counter', t, mm, n['db'] * BEAT * 0.9, int(n['v'] * 0.80))
        # 高八度闪烁
        for i in range(4):
            sparkle_run(b0 + 4 + i, [86, 89, 93, 98], 0.25, 30, 0.8, 'arp')


''')

# ---------------------------------------------------------------- 尾声加强
span("def coda(b0=85):", "# ------------------------------------------------------------------ 主流程", '''def coda(b0=85):
    # 85：全奏 D 大调（Picardy）
    drum(bt(b0, 0), 4, 104); dr_kick(b0, 0, 118)
    for m in (50, 57, 62, 66, 74):
        add('brass', bt(b0, 0), m, 1.2 * BEAT, 100)
        add('strings', bt(b0, 0), m, 2.0 * BEAT, 62)
    add('choir', bt(b0, 0), 62, 2.0 * BEAT, 40)
    # 八音盒：恋娘 A 动机（D 大调）
    motif = [(74, 0.0), (78, 0.5), (86, 1.0), (83, 1.5), (78, 2.0), (86, 2.5), (90, 3.0), (86, 3.5)]
    for (m, k) in motif:
        add('bell', bt(b0 + 1, k), m, 0.3, 84)
    sparkle_run(b0 + 1, [74, 78, 81, 86, 90], 0.25, 34, 0.8, 'arp')
    # バカ
    add('knife', bt(b0 + 2, 2.0), 86, 0.18, 84)
    add('knife', bt(b0 + 2, 2.25), 84, 0.16, 76)
    add('brass', bt(b0 + 2, 2.0), 50, 0.35 * BEAT, 74)
    # 数 1-2-3
    for i, m in enumerate([74, 76, 78]):
        add('bell', bt(b0 + 2, 3.0 + i * 0.25), m, 0.15, 70)
    # 最后一击：全奏长音 + 吊镲（原来尾声只剩 bell 14 音，-23.6dB 明显掉气）
    drum(bt(b0 + 2, 0), 4, 92)
    for m in (50, 57, 62, 66):
        add('brass', bt(b0 + 2, 0), m, 2.6 * BEAT, 80)
        add('strings', bt(b0 + 2, 0), m + 12 if m + 12 <= 96 else m, 3.4 * BEAT, 52)
    add('choir', bt(b0 + 2, 0), 62, 3.4 * BEAT, 40)
    add('bass', bt(b0 + 2, 0), 38, 3.6 * BEAT, 96)
    add('sub', bt(b0 + 2, 0), 26, 3.6 * BEAT, 46)
    for b in (b0 + 2, b0 + 3):
        dr_four(b, 102, 96, 34, 48, clap=44)
    for m in (50, 57, 62, 66):
        add('strings', bt(b0 + 2, 0), m, 4.0 * BEAT * 0.95, 44)
    add('choir', bt(b0 + 2, 0), 62, 4.0 * BEAT * 0.95, 30)
    for k in range(16):
        add('arp', bt(b0 + 2, k * 0.25), [50, 57, 62, 66][k % 4] + 24, 0.10, 26)
    for m in (50, 57, 62, 66):
        add('piano', bt(b0 + 2, 2.0), m, 1.6 * BEAT, 70)
    # 最后一小节：冰面余响（只有 pad 与三颗八音盒，保证循环点干净）
    add('bass', bt(b0 + 3, 0.0), 38, 0.9, 72)
    add('pad', bt(b0 + 3, 0.0), 50, 0.7, 26)
    add('bell', bt(b0 + 3, 0.5), 86, 0.30, 58)
    add('bell', bt(b0 + 3, 1.5), 93, 0.30, 52)
    add('bell', bt(b0 + 3, 2.5), 98, 0.40, 46)


# ------------------------------------------------------------------ 冰晶点缀（贯穿全曲）
def ice_accent():
    """段落交界铺冰晶/刀声 + B–E 段的钟摆（原来只有引子与数拍段有）"""
    glass = [
        (16, 3.0, 86, 46), (16, 3.5, 93, 42),
        (24, 3.0, 88, 46), (24, 3.5, 95, 42),
        (32, 3.0, 84, 44), (32, 3.5, 91, 40),
        (36, 3.0, 86, 46), (36, 3.5, 93, 42),
        (44, 3.0, 86, 44), (44, 3.5, 93, 40),
        (52, 3.0, 88, 46), (52, 3.5, 95, 42),
        (60, 3.0, 86, 48), (60, 3.5, 93, 44),
        (72, 3.0, 88, 46), (72, 3.5, 95, 42),
        (80, 3.0, 86, 48), (80, 3.5, 93, 44),
    ]
    for bar, beat, m, v in glass:
        add('bell', bt(bar, beat), m, 0.26, v)
    for bar in (16, 32, 44, 60, 80):
        add('knife', bt(bar, 3.75), 88, 0.14, 62)
        add('knife', bt(bar, 3.875), 86, 0.12, 56)
    for bar in list(range(25, 33)) + list(range(37, 45)) + list(range(45, 53)) + list(range(53, 61)):
        add('tick', bt(bar, 1.75), 93, 0.09, 24)
        add('tick', bt(bar, 3.75), 93, 0.09, 22)


''')

# ---------------------------------------------------------------- main 调用 ice_accent
sub("""    sec_final(81)
    coda(85)
""", """    sec_final(81)
    coda(85)
    ice_accent()
""")

io.open(P, 'w', encoding='utf-8').write(src)
print('patched', len(src), 'chars')
