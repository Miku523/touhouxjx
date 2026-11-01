# -*- coding: utf-8 -*-
import io, os
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(os.path.dirname(HERE), '_kag_compose.py')
s = io.open(SRC, encoding='utf-8').read().replace('\r\n', '\n')


def rep(old, new):
    global s
    assert s.count(old) == 1, ('anchor %d' % s.count(old), old[:70])
    s = s.replace(old, new)


# C3：鼓皮别压太狠（底鼓保气势、军鼓让一点掩蔽），主旋律对答句抬到 0.85
rep("e[2] = int(round(e[2] * (0.55 if e[1] in (2, 3) else 0.72)))",
    "e[2] = int(round(e[2] * (0.55 if e[1] in (2, 3) else (0.85 if e[1] == 0 else 0.78))))")
rep("            add('counter', t, m, d, v * 0.60)", "            add('counter', t, m, d, v * 0.85)")
io.open(SRC, 'w', encoding='utf-8', newline='\n').write(s)
print('v10f ok')
