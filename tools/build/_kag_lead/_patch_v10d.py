# -*- coding: utf-8 -*-
import io, os
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(os.path.dirname(HERE), '_kag_compose.py')
s = io.open(SRC, encoding='utf-8').read().replace('\r\n', '\n')


def rep(old, new):
    global s
    assert s.count(old) == 1, ('anchor %d' % s.count(old), old[:70])
    s = s.replace(old, new)


rep("    ('lead',    'sawtooth', 0.315),", "    ('lead',    'sawtooth', 0.325),")
rep("    ('brass',   'square',   0.152),", "    ('brass',   'square',   0.166),")

# C3：鼓只压镲片、其余轻压；主旋律加一条同度铜管对答（换声部混音，不抬 lead 电平）
rep("""    t3a, t3b = bt(68), bt(76)
    for e in DRUMS:
        if t3a <= e[0] < t3b:
            e[2] = int(round(e[2] * 0.76))""",
    """    t3a, t3b = bt(68), bt(76)
    for e in DRUMS:
        if t3a <= e[0] < t3b:
            e[2] = int(round(e[2] * (0.55 if e[1] in (2, 3) else 0.90)))
    for t, m, d, v in BY.get('lead', []):
        if t3a <= t < t3b:
            add('counter', t, m, d, v * 0.45)""")

rep("        add('sub', bt(bar), r, BAR * 0.97, 60)", "        add('sub', bt(bar), r, BAR * 0.97, 72)")
io.open(SRC, 'w', encoding='utf-8', newline='\n').write(s)
print('v10c ok')
