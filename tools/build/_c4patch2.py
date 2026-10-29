# -*- coding: utf-8 -*-
import io
p = 'tools/build/_fld_compose4.py'
s = io.open(p, encoding='utf-8').read()
old1 = "            remain = (end_bar - (bar - 1)) * 4.0 - off"
new1 = "            remain = (end_bar - bar) * 4.0 - off"
assert s.count(old1) == 1
s = s.replace(old1, new1)
old2 = "            remain = (b0 + n - (bar - 1)) * 4.0 - off"
new2 = "            remain = (b0 + n - bar) * 4.0 - off"
assert s.count(old2) == 1
s = s.replace(old2, new2)
io.open(p, 'w', encoding='utf-8').write(s)
print('clamp fixed')
