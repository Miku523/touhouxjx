# -*- coding: utf-8 -*-
"""把 stage6 的 8 条改进打进 tools/build/_kag_compose.py"""
import io, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(os.path.dirname(HERE), '_kag_compose.py')
s = io.open(SRC, encoding='utf-8').read().replace('\r\n', '\n')


def rep(old, new):
    global s
    assert s.count(old) == 1, ('anchor count %d' % s.count(old), old[:80])
    s = s.replace(old, new)


# ⑦ 副歌八度加倍减半（C3/D1/D2 的 +12 层原来太刺）
rep("            add('lead', t, m + 12, d, v * 0.30)\n"
    "            add('strings', t, m + 12 if m + 12 <= 96 else m, d, v * 0.34)",
    "            add('lead', t, m + 12, d, v * 0.14)\n"
    "            add('strings', t, m + 12 if m + 12 <= 96 else m, d, v * 0.18)")

# ⑤ 钟摆 tick 抬到能听见 + 加一层 1.2kHz 木鱼
rep("                for i in range(8):\n"
    "                    add('tick', bt(bar, i * 0.5), 93, 0.07, 82 if i % 2 == 0 else 64)",
    "                for i in range(8):\n"
    "                    add('tick', bt(bar, i * 0.5), 93, 0.10, 120 if i % 2 == 0 else 104)\n"
    "                    add('wood', bt(bar, i * 0.5), 86, 0.09, 62 if i % 2 == 0 else 50)")

# ⑤ tick 音量 + 新轨 wood
rep("    ('tick',    'square',   0.115),",
    "    ('tick',    'square',   0.150),\n    ('wood',    'sine',     0.072),")

PP = '''# ================= 第二版：八条改进 =================
def _in_band_root(k):
    """把小节根音挪进 MIDI 36-47（65-123 Hz），用来补 63-125Hz 的地基"""
    r = BARINFO[k]['root']
    while r < 36:
        r += 12
    while r > 47:
        r -= 12
    return r


def postprocess():
    # (1) B 段小号主题站住：同度加倍 + 弦乐齐奏，鼓整体让 1.2dB
    tA, tB, tM = bt(18), bt(34), bt(26)
    mel = [n for n in BY.get('brass', []) if tA <= n[0] < tB]
    for t, m, d, v in mel:
        add('brass', t, m, d, v * 0.40)
        add('strings', t, m, d, v * 0.22)
    # (2) B 段后半换织体：+12 叠层 / 四度和声 / ride / 段头吊镲
    for t, m, d, v in mel:
        if t >= tM:
            add('brass', t, m + 12 if m + 12 <= 100 else m, d, v * 0.34)
            add('strings', t, m + 12 if m + 12 <= 100 else m, d, v * 0.18)
            if m + 5 <= 100:
                add('brass', t, m + 5, d, v * 0.30)
    for bar in range(26, 34):
        for i in range(8):
            drum(bt(bar, i * 0.5), 7, 34 if i % 2 == 0 else 26)
    drum(tM, 4, 88)
    for e in DRUMS:
        if tA <= e[0] < tB:
            e[2] = int(round(e[2] * 0.87))
    # (3) C3（68-75）鼓让 1.5dB，主旋律补 1dB
    t3a, t3b = bt(68), bt(76)
    for e in DRUMS:
        if t3a <= e[0] < t3b:
            e[2] = int(round(e[2] * 0.84))
    for t, m, d, v in [n for n in BY.get('lead', []) if t3a <= n[0] < t3b]:
        add('lead', t, m, d, v * 0.16)
    # (4) C1 / D1 两次鼓抽空：留带 body 的底鼓 + 63-125Hz 的低音踏板
    for bar in list(range(53, 60)) + list(range(76, 84)):
        r = _in_band_root(bar)
        drum(bt(bar), 0, 86)
        drum(bt(bar, 2.5), 0, 56)
        add('bass', bt(bar), r, BAR * 0.92, 80)
        add('sub', bt(bar), r - 12, BAR * 0.90, 38)
    # (6) 引子补地基；尾声 103 小节全奏长音 + 吊镲，104 才交给八音盒
    add('bass', bt(1), 41, BAR * 1.96, 58)
    add('bass', bt(3), 39, BAR * 1.96, 54)
    add('sub', bt(1), 29, BAR * 1.90, 46)
    add('sub', bt(3), 27, BAR * 1.90, 44)
    for bar in (2, 4):
        drum(bt(bar, 2.5), 0, 40)
    for bar, r in ((101, 41), (102, 41), (103, 46), (104, 39)):
        add('bass', bt(bar), r, BAR * 0.90, 56)
        add('sub', bt(bar), r - 12, BAR * 0.88, 34)
    for m in (51, 55, 58, 63):
        add('strings', bt(103), m, BAR * 0.95, 58)
    for m in (51, 58, 63):
        add('brass', bt(103), m, BAR * 0.95, 52)
    add('choir', bt(103), 58, BAR * 0.92, 40)
    drum(bt(103), 4, 84)
    drum(bt(103), 0, 64)
    # (8) 全曲 63-125Hz 地基：每小节一根 band 内的低音踏板
    for bar in range(5, 101):
        add('sub', bt(bar), _in_band_root(bar), BAR * 0.97, 36)


'''
rep("\nsec_intro()\npad_layer()\nmoonlight()\nsec_coda()\nshape_drums()\n",
    "\n" + PP + "sec_intro()\npad_layer()\nmoonlight()\nsec_coda()\nshape_drums()\npostprocess()\n")

io.open(SRC, 'w', encoding='utf-8', newline='\n').write(s)
print('patched ok, lines =', len(s.split('\n')))
