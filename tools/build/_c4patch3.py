# -*- coding: utf-8 -*-
import io
p = 'tools/build/_fld_compose4.py'
s = io.open(p, encoding='utf-8').read()
def rep(old, new):
    global s
    assert s.count(old) == 1, old
    s = s.replace(old, new)

rep("    ('guitar', 'sawtooth', 0.052),", "    ('guitar', 'sawtooth', 0.062),")
rep("    ('lead', 'sawtooth', 0.200),", "    ('lead', 'sawtooth', 0.235),")
rep("    ('strings', 'sawtooth', 0.060),", "    ('strings', 'sawtooth', 0.066),")
rep("    ('choir', 'sine', 0.056),", "    ('choir', 'sine', 0.062),")
rep("    ('bass', 'triangle', 0.120),", "    ('bass', 'triangle', 0.128),")
rep("    ('piano', 'sine', 0.085),", "    ('piano', 'sine', 0.055),")
rep("L.DRUM_SCALE = 0.74", "L.DRUM_SCALE = 0.72")
io.open(p, 'w', encoding='utf-8').write(s)
print('gains updated')
