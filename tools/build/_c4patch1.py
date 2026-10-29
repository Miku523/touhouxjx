# -*- coding: utf-8 -*-
import io, sys
p = 'tools/build/_fld_compose4.py'
s = io.open(p, encoding='utf-8').read()

def rep(old, new, cnt=1):
    global s
    n = s.count(old)
    assert n == cnt, (old[:40], n)
    s = s.replace(old, new)

rep("""def play_theme(b0, name, vel=118, octv=0, shift=0, dscale=1.0, melody=THEME):
    for bo, off, p, d in melody:
        add(name, b0 + bo, off, p + octv + shift, d * dscale, vel)""",
"""def play_theme(b0, name, vel=118, octv=0, shift=0, dscale=1.0, melody=THEME, end_bar=None):
    for bo, off, p, d in melody:
        bar = b0 + bo
        dd = d
        if end_bar is not None:
            remain = (end_bar - (bar - 1)) * 4.0 - off
            dd = min(dd, remain)
        if dd <= 0.05:
            continue
        add(name, bar, off, p + octv + shift, dd * dscale, vel)""")

rep("""    play_theme(b0, 'lead', 124 if hero else 112, shift=shift, melody=melody)
    play_theme(b0, 'piano', 92, octv=12, shift=shift, melody=melody)
    if hero:
        play_theme(b0, 'bell', 50, octv=12, shift=shift, melody=melody)
    if harmony:
        for bo, off, p, d in melody:
            add('lead', b0 + bo, off, third_above(p + 12) + shift, d, 72)""",
"""    play_theme(b0, 'lead', 124 if hero else 112, shift=shift, melody=melody, end_bar=b0 + n)
    play_theme(b0, 'piano', 92, octv=12, shift=shift, melody=melody, end_bar=b0 + n)
    if hero:
        play_theme(b0, 'bell', 50, octv=12, shift=shift, melody=melody, end_bar=b0 + n)
    if harmony:
        for bo, off, p, d in melody:
            bar = b0 + bo
            remain = (b0 + n - (bar - 1)) * 4.0 - off
            dd = min(d, remain)
            if dd <= 0.05:
                continue
            add('lead', bar, off, third_above(p + 12) + shift, dd, 72)""")

rep("""    play_theme(37, 'lead', 108, melody=THEME2)
    play_theme(37, 'piano', 86, octv=12, melody=THEME2)""",
"""    play_theme(37, 'lead', 108, melody=THEME2, end_bar=41)
    play_theme(37, 'piano', 86, octv=12, melody=THEME2, end_bar=41)""")

rep("""    base = [86, 88, 89, 91, 93, 94, 96, 98]""",
"""    base = [84, 86, 88, 89, 91, 93, 94, 96]""")

rep("""        add('choir', b, 0.0, 62, 1.9, 34)
        add('choir', b, 0.0, 65, 1.9, 32)
        add('choir', b, 0.0, 69, 1.9, 30)""",
"""        choir_chord(b, 34, 4)""")

rep("""        (11, 0.0, 72, 1.5, 84), (11, 2.0, 76, 1.5, 78),""",
"""        (11, 0.0, 72, 1.5, 84), (11, 2.0, 77, 1.5, 78),""")

rep("""    play_theme(103, 'lead', 126, melody=THEME2)""",
"""    play_theme(103, 'lead', 126, melody=THEME2, end_bar=105)""")

io.open(p, 'w', encoding='utf-8').write(s)
print('patched ok')
