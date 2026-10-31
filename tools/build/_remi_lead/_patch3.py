# -*- coding: utf-8 -*-
import io, os, re
P = os.path.join(os.getcwd(), 'tools', 'build', '_remi_compose.py')
s = io.open(P, encoding='utf-8').read()

pairs = [
 ("END_TICK = MUSIC0 + 82 * GRID          # 原曲 82 小节之后收束",
  "END_TICK = MUSIC0 + 81 * GRID          # 原曲 81 小节（末和弦）之后收束"),
 ("""    if nb <= 87:
        return INTRO + (tick_at(MUSIC0 + (nb - 5) * GRID) - SHIFT)
    return OUT + (nb - 87) * BAR0""",
  """    if nb <= 86:
        return INTRO + (tick_at(MUSIC0 + (nb - 5) * GRID) - SHIFT)
    return OUT + (nb - 86) * BAR0"""),
 ("""    if nb <= 86:
        return round(INTRO + (tick_at(MUSIC0 + (nb - 5) * GRID + beat * 480) - SHIFT), 4)
    return round(OUT + (nb - 87) * BAR0 + beat * BAR0 / 4.0, 4)""",
  """    if nb <= 85:
        return round(INTRO + (tick_at(MUSIC0 + (nb - 5) * GRID + beat * 480) - SHIFT), 4)
    return round(OUT + (nb - 86) * BAR0 + beat * BAR0 / 4.0, 4)"""),
 ("    for (nb, v) in ((1, 74), (13, 78), (29, 80), (53, 82), (69, 86), (87, 96), (89, 58)):",
  "    for (nb, v) in ((1, 74), (13, 78), (29, 80), (53, 82), (69, 86), (86, 96), (88, 58)):"),
 ("    # 尾声 87-90：全奏 Bb 小调终止", "    # 尾声 86-89：全奏 Bb 小调终止"),
 ("    dr(86, 0, 4, 112); dr(86, 0, 0, 112)\n    # 尾声 87-90", "    # 尾声 86-89"),
 ("    # 尾声 87-90\n    dr(87, 0, 4, 120); dr(87, 0, 0, 118); dr(87, 0, 5, 104); dr(87, 2.5, 5, 92)\n    dr(88, 0, 0, 92); dr(88, 2, 5, 80)\n    dr(90, 0, 0, 76)",
  "    # 尾声 86-89\n    dr(86, 0, 4, 120); dr(86, 0, 0, 118); dr(86, 0, 5, 104); dr(86, 2.5, 5, 92)\n    dr(87, 0, 0, 92); dr(87, 2, 5, 80)\n    dr(89, 0, 0, 76)"),
]
for a, b in pairs:
    if s.count(a) != 1:
        print('MISS', a[:60]); continue
    s = s.replace(a, b)

# 尾声 W_ 小节号 87/88/89/90 → 86/87/88/89（只改尾声段落的行）
lines = s.split('\n')
start = next(i for i, l in enumerate(lines) if '# 尾声 86-89：全奏' in l)
end = next(i for i, l in enumerate(lines) if '# ---- 鼓组' in l)
for i in range(start, end):
    lines[i] = re.sub(r'W_\((tutti|chor2|swell|pad|ped), (8[7-9]|90),',
                      lambda m: 'W_(%s, %d,' % (m.group(1), int(m.group(2)) - 1), lines[i])
s = '\n'.join(lines)
s = s.replace(' * %.1f BPM, 降 B 小调, 4/4, 90 小节 = %.1fs 循环。', ' * %.1f BPM, 降 B 小调, 4/4, 89 小节 = %.1fs 循环。')
s = s.replace(' *   原曲 b1-82 -> 新 b5-86（引子', ' *   原曲 b1-81 -> 新 b5-85（引子')
s = s.replace(' *   尾声 87-90（全奏', ' *   尾声 86-89（全奏')
io.open(P, 'w', encoding='utf-8').write(s)
print('done')
