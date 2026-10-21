# -*- coding: utf-8 -*-
import io, sys
p='tools/un_flandre.py'
s=io.open(p,encoding='utf-8').read().replace('\r\n','\n')
# 1) 孤独段/前奏/尾奏的旋律走 sine（音乐盒），不走 square
s=s.replace("""for i, (bar, bt, m, beats) in enumerate([(2, 0, 81, 1), (2, 1.5, 86, 1), (3, 0, 89, 1.5), (3, 2, 86, 2)]):
    bell('lead', i * 2, bt, m - 12, beats, 62)""",
"""for i, (bar, bt, m, beats) in enumerate([(2, 0, 81, 1), (2, 1.5, 86, 1), (3, 0, 89, 1.5), (3, 2, 86, 2)]):
    bell('pad', i * 2, bt, m, beats, 66)""")
s=s.replace("""topE, _ = split_top(L['6'], 15, 21)
place('lead', [(b, bt, m, be, v) for (b, bt, m, be, v) in topE], 15, 57, vel=54)
place('pad', ln(L['4'], 15, 21), 15, 57, vel=44)""",
"""topE, _ = split_top(L['6'], 15, 21)
place('pad', topE, 15, 57, transpose=12, vel=54, max_pitch=104)
place('pad', ln(L['4'], 15, 21), 15, 57, vel=42)""")
s=s.replace("""for i, (bar, bt, m, beats) in enumerate([(2, 0, 81, 1), (2, 1.5, 86, 1), (3, 0, 89, 1.5), (3, 2, 86, 3)]):
    bell('lead', 87 + i // 2, bt, m - 12, beats, 56)""",
"""for i, (bar, bt, m, beats) in enumerate([(2, 0, 81, 1), (2, 1.5, 86, 1), (3, 0, 89, 1.5), (3, 2, 86, 4)]):
    bell('pad', 87 + i // 2, bt, m, beats, 58)""")
# 2) 音量：整体抬一点，harm 抬到能听清
s=s.replace("WAVES = {'lead': ('square', 0.115), 'harm': ('square', 0.052), 'bass': ('triangle', 0.175),\n         'pad': ('sine', 0.058)}",
            "WAVES = {'lead': ('square', 0.128), 'harm': ('square', 0.06), 'bass': ('triangle', 0.19),\n         'pad': ('sine', 0.062)}")
io.open(p,'w',encoding='utf-8',newline='\r\n').write(s)
print('patched')
