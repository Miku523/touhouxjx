# -*- coding: utf-8 -*-
import io, os
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(os.path.dirname(HERE), '_kag_compose.py')
s = io.open(SRC, encoding='utf-8').read().replace('\r\n', '\n')
old = "def _fit_band(m):"
new = """def _in_band_root(k):
    return _fit_band(BARINFO[k]['root'])


def _fit_band(m):"""
assert s.count(old) == 1
s = s.replace(old, new)
io.open(SRC, 'w', encoding='utf-8', newline='\n').write(s)
print('ok')
