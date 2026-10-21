# -*- coding: utf-8 -*-
"""pad_long 五度算错（把大三度降成小三度）导致持续半音撞车，修掉。"""
P = r'C:\Users\GuSheng\Downloads\HKS\tools\aya_stage4.py'
t = open(P, 'rb').read().decode('utf-8').replace('\r\n', '\n')
old = """def pad_long(bar, chord, vel=44, bars=1, base=60):
    root, tpl = CHORDS[chord]
    fifth = tpl[1] if len(tpl) > 1 else 7
    fifth = 3 if fifth == 4 else fifth
    m = [root, fifth, root + 12][bar % 3]
    S.add('pad', bar, 0, base + m, 16 * bars, vel)"""
new = """def pad_long(bar, chord, vel=44, bars=1, base=60):
    root, tpl = CHORDS[chord]
    third = tpl[1] if len(tpl) > 1 else 4
    fifth = tpl[2] if len(tpl) > 2 else 7
    m = [root, fifth, root + 12, third][bar % 4]
    S.add('pad', bar, 0, base + m, 16 * bars, vel)"""
assert old in t, 'pad_long 没找到'
t = t.replace(old, new, 1)
open(P, 'wb').write(t.replace('\n', '\r\n').encode('utf-8'))
print('pad_long fixed')
