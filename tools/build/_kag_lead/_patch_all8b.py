# -*- coding: utf-8 -*-
import io, os
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(os.path.dirname(HERE), '_kag_compose.py')
s = io.open(SRC, encoding='utf-8').read().replace('\r\n', '\n')


def rep(old, new):
    global s
    assert s.count(old) == 1, ('anchor %d' % s.count(old), old[:70])
    s = s.replace(old, new)


# 低音踏板避让：与小节里长音弦乐成半音时改走五度，再撞就跳过
rep('''def _in_band_root(k):''',
    '''STR_LONG = {}
for _n in NOTES:
    if _n['ch'] in (6, 7) and _n['d'] >= 0.75:
        STR_LONG.setdefault(_n['k'], set()).add(_n['m'])


def _pedal_shift(bar, r):
    """与小节里的长音弦乐成半音就把踏板挪到五度，仍撞就返回 None"""
    for cand in (r, r + 7, r + 12):
        ok = True
        for m2 in STR_LONG.get(bar, ()):
            if pcd(m2, cand) == 1:
                ok = False
                break
        if ok:
            return cand
    return None


def _in_band_root(k):''')

rep("""    for bar in list(range(53, 60)) + list(range(76, 84)):
        r = _in_band_root(bar)
        drum(bt(bar), 0, 86)
        drum(bt(bar, 2.5), 0, 56)
        add('bass', bt(bar), r, BAR * 0.92, 80)
        add('sub', bt(bar), r - 12, BAR * 0.90, 38)""",
    """    for bar in list(range(53, 60)) + list(range(76, 84)):
        r = _pedal_shift(bar, _in_band_root(bar))
        drum(bt(bar), 0, 86)
        drum(bt(bar, 2.5), 0, 56)
        if r is None:
            continue
        add('bass', bt(bar), r, BAR * 0.92, 80)
        add('sub', bt(bar), r - 12, BAR * 0.90, 38)""")

rep("""    for bar in range(5, 101):
        add('sub', bt(bar), _in_band_root(bar), BAR * 0.97, 36)""",
    """    for bar in range(5, 101):
        r = _pedal_shift(bar, _in_band_root(bar))
        if r is None:
            continue
        add('sub', bt(bar), r, BAR * 0.97, 36)""")

io.open(SRC, 'w', encoding='utf-8', newline='\n').write(s)
print('patched2 ok, lines =', len(s.split('\n')))
