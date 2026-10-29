# -*- coding: utf-8 -*-
import io
p = 'tools/build/_fld_compose4.py'
s = io.open(p, encoding='utf-8').read()
old = """    play_theme(b0, 'piano', 92, octv=12, shift=shift, melody=melody, end_bar=b0 + n)"""
new = """    play_theme(b0, 'piano', 92, octv=12, shift=shift, melody=melody, end_bar=b0 + n)
    play_theme(b0, 'piano', 72, octv=0, shift=shift, melody=melody, end_bar=b0 + n)"""
assert s.count(old) == 1
s = s.replace(old, new)
io.open(p, 'w', encoding='utf-8').write(s)
print('chorus piano octave doubled')
