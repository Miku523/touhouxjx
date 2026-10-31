# -*- coding: utf-8 -*-
import io, re, os
P = os.path.join(os.getcwd(), 'tools', 'build', '_remi_compose.py')
s = io.open(P, encoding='utf-8').read()
orig = s
pairs = [
 ("lead = track('brass', 'square', 0.105)", "lead = track('brass', 'square', 0.170)"),
 ("lead_s = track('strings', 'sawtooth', 0.044)", "lead_s = track('strings', 'sawtooth', 0.062)"),
 ("lead_l = track('counter', 'triangle', 0.056)", "lead_l = track('counter', 'triangle', 0.068)"),
 ("strings = track('strings', 'sawtooth', 0.085)", "strings = track('strings', 'sawtooth', 0.115)"),
 ("choir = track('choir', 'sine', 0.050)", "choir = track('choir', 'sine', 0.066)"),
 ("piano = track('piano', 'sine', 0.060)", "piano = track('piano', 'sine', 0.080)"),
 ("pno_in = track('piano', 'sine', 0.032)", "pno_in = track('piano', 'sine', 0.040)"),
 ("harpsi = track('harpsi', 'square', 0.052)", "harpsi = track('harpsi', 'square', 0.058)"),
 ("arp = track('arp', 'sine', 0.040)", "arp = track('arp', 'sine', 0.045)"),
 ("bass = track('bass', 'triangle', 0.105)", "bass = track('bass', 'triangle', 0.082)"),
 ("sub = track('bass', 'sine', 0.018)", "sub = track('bass', 'sine', 0.015)"),
 ("stab = track('brass', 'square', 0.045)", "stab = track('brass', 'square', 0.055)"),
 ("organ = track('pad', 'sine', 0.050)", "organ = track('pad', 'sine', 0.062)"),
 ("strhi = track('strings', 'sawtooth', 0.050)", "strhi = track('strings', 'sawtooth', 0.062)"),
 ("pad = track('pad', 'sine', 0.060)", "pad = track('pad', 'sine', 0.070)"),
 ("swell = track('strings', 'sawtooth', 0.070)", "swell = track('strings', 'sawtooth', 0.085)"),
 ("tutti = track('brass', 'square', 0.090)", "tutti = track('brass', 'square', 0.110)"),
 ("chor2 = track('choir', 'sine', 0.050)", "chor2 = track('choir', 'sine', 0.060)"),
 ("ped = track('bass', 'triangle', 0.070)", "ped = track('bass', 'triangle', 0.080)"),
]
for a, b in pairs:
    assert s.count(a) == 1, a
    s = s.replace(a, b)

# ---- 引子 II（原曲 b1-8）补管风琴和弦与低音踏板，避免前 20 秒过空
anchor = "    # 尾声 87-90：全奏 Bb 小调终止\n"
assert s.count(anchor) == 1
INTRO2 = '''    # 引子 II（新 5-12 = 原曲 b1-8）：管风琴和弦 + 低音踏板，把开场的宫廷体量撑起来
    CH = {('Eb', 'm'): (39, [51, 54, 58]), ('B', 'M'): (35, [47, 51, 54]),
          ('Db', 'M'): (37, [49, 53, 56])}
    intro2_seq = [(5, 'Eb'), (7, 'B'), (9, 'Db'), (11, 'Eb')]
    for (nb, root) in intro2_seq:
        rt, tones = CH[(root, 'm')] if root == 'Eb' else CH[(root, 'M')]
        dur = 2 * BL(nb) * 0.99
        for i, p in enumerate(tones):
            W_(pad, nb, 0, p, dur, 44 - i * 3)
            W_(swell, nb, 0, p + 12, dur, 34 - i * 2)
        W_(ped, nb, 0, rt, 2 * BL(nb) * 0.96, 72)
        W_(ped, nb + 1, 0, rt, 2 * BL(nb) * 0.96, 64)
        W_(pad, nb, 0, rt + 12, dur, 36)

'''
s = s.replace(anchor, INTRO2 + anchor)
io.open(P, 'w', encoding='utf-8').write(s)
print('patched', len(s) - len(orig))
