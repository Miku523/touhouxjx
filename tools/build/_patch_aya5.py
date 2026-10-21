# -*- coding: utf-8 -*-
"""v9：修 pad_long 的绝对音高 bug。

原代码 `fifth = tpl[2]`（音程）当作绝对偏移用，导致 base+7 恒定：
F#m 小节铺 G4（小二度！）、D 小节铺 G4（不属于 D）—— D 段 92-106s 难听的元凶。
"""
P = r'C:\Users\GuSheng\Downloads\HKS\tools\aya_stage4.py'
t = open(P, 'rb').read().decode('utf-8').replace('\r\n', '\n')
old = """def pad_long(bar, chord, vel=44, bars=1, base=60):
    root, tpl = CHORDS[chord]
    third = tpl[1] if len(tpl) > 1 else 4
    fifth = tpl[2] if len(tpl) > 2 else 7
    m = [root, fifth, root + 12][bar % 3]
    S.add('pad', bar, 0, base + m, 16 * bars, vel)"""
new = """def pad_long(bar, chord, vel=44, bars=1, base=60):
    \"\"\"长音铺底：根音 / 五度 / 八度轮换，必须落在和弦音上（base+root 为基准）。\"\"\"
    root, tpl = CHORDS[chord]
    fifth = root + (tpl[2] if len(tpl) > 2 else 7)
    m = [root, fifth, root + 12][bar % 3]
    S.add('pad', bar, 0, base + m, 16 * bars, vel)"""
assert old in t, 'pad_long 代码块没找到'
t = t.replace(old, new, 1)
open(P, 'wb').write(t.replace('\n', '\r\n').encode('utf-8'))
print('pad_long 绝对音高已修')
