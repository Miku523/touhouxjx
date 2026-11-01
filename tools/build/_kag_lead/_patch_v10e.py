# -*- coding: utf-8 -*-
import io, os
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(os.path.dirname(HERE), '_kag_compose.py')
s = io.open(SRC, encoding='utf-8').read().replace('\r\n', '\n')


def rep(old, new):
    global s
    assert s.count(old) == 1, ('anchor %d' % s.count(old), old[:70])
    s = s.replace(old, new)


# C3：鼓真正降 2dB（镲片 0.55 / 鼓皮 0.72），对答句抬到 0.6
rep("e[2] = int(round(e[2] * (0.55 if e[1] in (2, 3) else 0.90)))",
    "e[2] = int(round(e[2] * (0.55 if e[1] in (2, 3) else 0.72)))")
rep("            add('counter', t, m, d, v * 0.45)", "            add('counter', t, m, d, v * 0.60)")
# 低音踏板改成 bass+sub 两层，vel 抬上去
rep("""        add('sub', bt(bar), r, BAR * 0.97, 72)""",
    """        add('bass', bt(bar), r, BAR * 0.95, 64)
        add('sub', bt(bar), r, BAR * 0.97, 90)""")
io.open(SRC, 'w', encoding='utf-8', newline='\n').write(s)
print('v10d ok')
