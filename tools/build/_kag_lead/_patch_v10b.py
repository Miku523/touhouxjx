# -*- coding: utf-8 -*-
"""v10b：按实测回改——加倍层受 voice 的 0.4 vel 下限影响会 +5dB，改回电平/事件混音"""
import io, os
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(os.path.dirname(HERE), '_kag_compose.py')
s = io.open(SRC, encoding='utf-8').read().replace('\r\n', '\n')


def rep(old, new):
    global s
    assert s.count(old) == 1, ('anchor %d' % s.count(old), old[:70])
    s = s.replace(old, new)


# (7) 去掉副歌 +12 的 lead 叠层（原来的 108-112 刺音就是它）
rep("""        if k >= 68:                                # C3/D1/D2：副歌高音区，加厚成全曲最亮
            add('lead', t, m + 12, d, v * 0.14)
            add('strings', t, m + 12 if m + 12 <= 96 else m, d, v * 0.18)""",
    """        if k >= 68:                                # C3/D1/D2：副歌高音区，加厚成全曲最亮
            add('strings', t, m + 12 if m + 12 <= 96 else m, d, v * 0.18)""")

# 轨道增益：brass +1.0dB（B 段主题）、lead +0.4dB（C3 主旋律）、tick/wood 再抬一点
rep("    ('lead',    'sawtooth', 0.300),", "    ('lead',    'sawtooth', 0.315),")
rep("    ('brass',   'square',   0.135),", "    ('brass',   'square',   0.152),")
rep("    ('tick',    'square',   0.150),", "    ('tick',    'square',   0.170),")
rep("    ('wood',    'sine',     0.072),", "    ('wood',    'sine',     0.085),")

# 木鱼层 vel 抬一点
rep("                    add('wood', bt(bar, i * 0.5), 86, 0.09, 62 if i % 2 == 0 else 50)",
    "                    add('wood', bt(bar, i * 0.5), 86, 0.09, 78 if i % 2 == 0 else 64)")

NEW_PP = '''# ================= 第二版：八条改进 =================
STR_LONG = {}
for _n in NOTES:
    if _n['ch'] in (6, 7) and _n['d'] >= 0.75:
        STR_LONG.setdefault(_n['k'], set()).add(_n['m'])


def _fit_band(m):
    """把音高挪进 MIDI 36-47（65-123 Hz），给 63-125Hz 当地基"""
    while m < 36:
        m += 12
    while m > 47:
        m -= 12
    return m


def _pedal_pitch(bar, r):
    """根音优先，撞半音就换五度；都撞就给 None"""
    for pc in (r, r + 7):
        cand = _fit_band(pc)
        if not any(pcd(m2, cand) == 1 for m2 in STR_LONG.get(bar, ())):
            return cand
    return None


def postprocess():
    tA, tB, tM = bt(18), bt(34), bt(26)
    # (1) B 段：鼓让 1.9dB，小号旋律全段加弦乐齐奏（只加倍完整落在 B 里的音）
    mel = [n for n in BY.get('brass', []) if tA <= n[0] < tB]
    for t, m, d, v in mel:
        if t + d <= tB - 0.06:
            add('strings', t, m, d, v * 0.22)
    for bar in range(18, 34):
        for e in DRUMS:
            if bt(bar) <= e[0] < bt(bar) + BAR:
                e[2] = int(round(e[2] * 0.80))
    # (2) B 段后半：换织体——旋律 +12 走 counter 声部、ride 加满、段头吊镲
    for t, m, d, v in mel:
        if t >= tM and m + 12 <= 100:
            add('counter', t, m + 12, d, v * 0.55)
    for bar in range(26, 34):
        for i in range(8):
            drum(bt(bar, i * 0.5), 7, 30 if i % 2 == 0 else 24)
    drum(tM, 4, 80)
    # (3) C3（68-75）鼓收 2.4dB，主旋律靠 lead 增益 +0.4dB 站住
    t3a, t3b = bt(68), bt(76)
    for e in DRUMS:
        if t3a <= e[0] < t3b:
            e[2] = int(round(e[2] * 0.76))
    # (4) C1 / D1 两次鼓抽空：留带 body 的底鼓 + 63-125Hz 低音踏板
    for bar in list(range(53, 60)) + list(range(76, 84)):
        drum(bt(bar), 0, 86)
        drum(bt(bar, 2.5), 0, 56)
        r = _pedal_pitch(bar, _in_band_root(bar))
        if r is None:
            continue
        add('bass', bt(bar), r, BAR * 0.92, 84)
        add('sub', bt(bar), r - 12, BAR * 0.90, 40)
    # (6) 引子补地基；尾声 103 小节全奏长音 + 吊镲，104 才交给八音盒
    add('bass', bt(1), 41, BAR * 1.96, 58)
    add('bass', bt(3), 39, BAR * 1.96, 54)
    add('sub', bt(1), 29, BAR * 1.90, 46)
    add('sub', bt(3), 27, BAR * 1.90, 44)
    for bar in (2, 4):
        drum(bt(bar, 2.5), 0, 40)
    for bar, r in ((101, 41), (102, 41), (103, 46), (104, 39)):
        add('bass', bt(bar), r, BAR * 0.90, 58)
        add('sub', bt(bar), r - 12, BAR * 0.88, 36)
    for m in (51, 55, 58, 63):
        add('strings', bt(103), m, BAR * 0.95, 58)
    for m in (51, 58, 63):
        add('brass', bt(103), m, BAR * 0.95, 52)
    add('choir', bt(103), 58, BAR * 0.92, 40)
    drum(bt(103), 4, 84)
    drum(bt(103), 0, 64)
    # (8) 全曲 63-125Hz 地基：每小节一根 band 内的低音踏板
    for bar in range(5, 101):
        r = _pedal_pitch(bar, _in_band_root(bar))
        if r is None:
            continue
        add('sub', bt(bar), r, BAR * 0.97, 60)


'''
i0 = s.index('# ================= 第二版：八条改进 =================')
i1 = s.index('\nsec_intro()\n', i0)
s = s[:i0] + NEW_PP + s[i1 + 1:]
io.open(SRC, 'w', encoding='utf-8', newline='\n').write(s)
print('v10b patched, lines', len(s.split('\n')))
