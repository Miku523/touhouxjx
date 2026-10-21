# -*- coding: utf-8 -*-
import io
p='tools/un_flandre.py'
s=io.open(p,encoding='utf-8').read().replace('\r\n','\n')
head='# ================================================================ 段落'
tail='# ---------------------------------------------------------------- 复音裁剪'
i0=s.index(head); i1=s.index(tail)
new = '''# ================================================================ 段落
# 源曲素材块（ZUN MIDI 1-based 小节号）：
#   M  主旋律 = ch5 钟琴 bar12-19 + ch6 方波 bar16-20（八度成对的招牌旋律）
#   M2 主旋律再现 = ch6 bar56-64
#   R  riff 琶音 = ch6 bar2-11
#   U  狂奔 = ch6 bar21-34 ; U2 后段狂奔 = ch6 bar65-76
# 结构：0-7 序 | 8-16 A 主旋律 | 17-25 A2 主旋律加倍 | 26-35 B riff 疯狂
#       36-49 C 狂奔 | 50-53 D 力量桥 | 54-62 E 孤独 | 63-71 F 主旋律全奏
#       72-83 G 后段狂奔 | 84-95 T 凋零


def merge(*layers):
    d = {}
    for lyr in layers:
        for (bar, bt, m, beats, v) in lyr:
            d[(bar, round(bt, 3), m)] = [bar, bt, m, beats, v]
    return [d[k] for k in sorted(d)]


MEL = merge(ln(L['5'], 12, 20), ln(L['6'], 16, 21))     # 9 小节
MEL2 = ln(L['6'], 56, 65)                                # 9 小节
RIFF = ln(L['6'], 2, 12)                                 # 10 小节
RUN = ln(L['6'], 21, 35)                                 # 14 小节
RUN2 = ln(L['6'], 65, 77)                                # 12 小节
ACC = ln(L['2'], 12, 21)                                 # 主旋律段的琶音伴奏
ACC2 = ln(L['2'], 56, 65)

TH_TOP, TH_REST = split_top(MEL, 12, 21)
RH_TOP, RH_REST = split_top(RIFF, 2, 12)
RU_TOP, RU_REST = split_top(RUN, 21, 35)
M2_TOP, M2_REST = split_top(MEL2, 56, 65)
R2_TOP, R2_REST = split_top(RUN2, 65, 77)

# --- 序 0-7：主旋律的音乐盒版（sine），弦乐垫底，心跳逼近
place('pad', TH_TOP, 12, 0, transpose=12, vel=64, dur_scale=1.0, max_pitch=104)
place('pad', ln(L['4'], 12, 20), 12, 0, vel=50, dur_scale=1.0)
for b in range(2, 8):
    drum(b, 0, 0, 56 + (b - 2) * 7)
for b in range(5, 8):
    for s in range(16):
        drum(b, s, 1, 36 + (b - 5) * 20 + s)
    add('bass', b * BAR, 38 + (b - 5) * 2, BAR * 0.9, 86)
crash(8, 96)

# --- A 8-16：主旋律第一次全奏（钟琴线 + 琶音伴奏 + 半音低音）
place('lead', TH_TOP, 12, 8, vel=112)
place('harm', TH_REST, 12, 8, vel=84)
place('harm', ACC, 12, 8, vel=72, max_pitch=88)
place('bass', ln(L['9'], 12, 21), 12, 8, vel=112)
place('pad', ln(L['4'], 12, 21), 12, 8, vel=58, dur_scale=1.0)
for i in range(9):
    groove(8 + i, 1, 'main')
fill(16, 1)
crash(8, 110)

# --- A2 17-25：主旋律八度加倍 + 半音乱流，驱动鼓
place('lead', TH_TOP, 12, 17, vel=116)
place('harm', TH_REST, 12, 17, vel=92)
place('harm', ACC, 12, 17, vel=78, max_pitch=88)
place('harm', TH_TOP, 12, 17, transpose=12, vel=68, max_pitch=104)
place('bass', ln(L['9'], 12, 21), 12, 17, vel=116)
place('pad', ln(L['4'], 12, 21), 12, 17, vel=54, dur_scale=1.0)
for i in range(9):
    groove(17 + i, 1, 'drive')
for i, b in enumerate(range(22, 26)):
    for s in range(16):
        add('harm', b * BAR + s * BAR / 16, (94 - i * 3 - s) % 13 + 72, BAR / 16 * 0.5, 76)
fill(24, 1)
crash(17, 114)

# --- B 26-35：riff 琶音炸弹（原曲前奏的疯狂 ri\u200bff），driving
place('lead', RH_TOP, 2, 26, vel=120)
place('harm', RH_REST, 2, 26, vel=104)
place('bass', ln(L['9'], 2, 12), 2, 26, vel=118)
place('pad', ln(L['4'], 2, 12), 2, 26, vel=54, dur_scale=1.0)
for i in range(10):
    groove(26 + i, 1, 'drive')
fill(34, 2)
crash(26, 116)

# --- C 36-49：狂奔（原曲 bar21-34）
place('lead', RU_TOP, 21, 36, vel=122)
place('harm', RU_REST, 21, 36, vel=104)
place('bass', ln(L['9'], 21, 35), 21, 36, vel=118)
place('pad', ln(L['4'], 21, 35), 21, 36, vel=48, dur_scale=1.0)
for i in range(14):
    groove(36 + i, 1, 'drive')
crash(36, 116)
for i, b in enumerate(range(44, 50)):
    for s in range(16):
        add('harm', b * BAR + s * BAR / 16, (98 - i * 2 - s) % 13 + 72, BAR / 16 * 0.5, 84)

# --- D 50-53：力量桥，半音下行 + 双脚鼓
for i, b in enumerate(range(50, 54)):
    m = 50 - i * 2
    for s in range(16):
        add('bass', b * BAR + s * BAR / 16, m - (s % 4), BAR / 16 * 0.8, 116)
    for s in range(16):
        drum(b, s, 0, 118 if s % 2 == 0 else 96)
    for s in (4, 12):
        drum(b, s, 1, 112)
    for s in range(16):
        drum(b, s, 2, 76)
fill(52, 2, 80, 3)
crash(50, 112)

# --- E 54-62：囚禁 495 年。主旋律只剩音乐盒 + 心跳 + 低音弦
place('pad', M2_TOP, 56, 54, transpose=12, vel=70, dur_scale=1.0, max_pitch=104)
place('pad', ln(L['4'], 56, 65), 56, 54, vel=46, dur_scale=1.0)
for b in range(54, 61):
    add('bass', b * BAR, 38, BAR * 0.95, 54)
for i in range(8):
    groove(54 + i, 1, 'quiet')
for b in range(61, 63):
    for s in range(16):
        drum(b, s, 1, 34 + (s + (b - 61) * 16) * 4)
    drum(b, 0, 0, 88)
crash(54, 62)

# --- F 63-71：主旋律再现，全曲最饱满（上下八度夹击 + 琶音伴奏）
place('lead', M2_TOP, 56, 63, vel=124)
place('harm', M2_REST, 56, 63, vel=104)
place('harm', ACC2, 56, 63, vel=80, max_pitch=88)
place('harm', M2_TOP, 56, 63, transpose=12, vel=72, max_pitch=104)
place('bass', ln(L['9'], 56, 65), 56, 63, vel=120)
place('pad', ln(L['4'], 56, 65), 56, 63, vel=56, dur_scale=1.0)
for i in range(9):
    groove(63 + i, 1, 'final' if i >= 5 else 'drive')
fill(70, 1, 84, 3)
crash(63, 120)

# --- G 72-83：后段狂奔（原曲 bar65-76，全曲最烈）
place('lead', R2_TOP, 65, 72, vel=124)
place('harm', R2_REST, 65, 72, vel=104)
place('harm', ln(L['2'], 65, 77), 65, 72, transpose=12, vel=72, max_pitch=104)
place('bass', ln(L['9'], 65, 77), 65, 72, vel=120)
place('pad', ln(L['4'], 65, 77), 65, 72, vel=48, dur_scale=1.0)
for i in range(12):
    groove(72 + i, 1, 'final')
for i, b in enumerate(range(78, 84)):
    for s in range(16):
        add('harm', b * BAR + s * BAR / 16, (100 - i * 3 - s) % 13 + 72, BAR / 16 * 0.5, 86)
crash(72, 120)

# --- T 84-95：凋零，主旋律尾巴散成音乐盒
place('pad', [(b, bt, m, be, v) for (b, bt, m, be, v) in M2_TOP if b < 60], 56, 84, transpose=12, vel=60, dur_scale=1.0, max_pitch=104)
place('pad', ln(L['4'], 56, 58), 56, 87, vel=42, dur_scale=1.0)
for b in range(84, 88):
    for s in range(16):
        drum(b, s, 1, 96 - (b - 84) * 22 + s)
    drum(b, 0, 0, 98)
crash(84, 88)

'''
s = s[:i0] + new + s[i1:]
io.open(p,'w',encoding='utf-8',newline='\r\n').write(s)
print('section block v3 installed')
