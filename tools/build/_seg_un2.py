# -*- coding: utf-8 -*-
import io
p='tools/un_flandre.py'
s=io.open(p,encoding='utf-8').read().replace('\r\n','\n')
head='# ================================================================ 段落'
tail='# ---------------------------------------------------------------- 复音裁剪'
i0=s.index(head); i1=s.index(tail)
new = '''# ================================================================ 段落
# 0-7 intro（主题音乐盒）| 8-18 A riff | 19-29 A2 riff 加倍 | 30-38 B 主题
# 39-52 C 狂奔 | 53-56 D 力量桥 | 57-64 E 孤独 | 65-75 F 终局 | 76-86 G 狂奔再现
# 87-95 T 凋零
# 源曲小节对照：主题 bar16-20（A4/A5 八度对 = U.N. 招牌主题）、riff bar2-11、狂奔 bar21-34、后段狂奔 bar65-76

TH_TOP, TH_REST = split_top(L['6'], 16, 21)

# --- intro 0-7：主题旋律的音乐盒版（sine）+ 弦乐 + 心跳
place('pad', TH_TOP, 16, 1, transpose=12, vel=64, dur_scale=1.0, max_pitch=104)
place('pad', ln(L['4'], 16, 21), 16, 1, vel=52, dur_scale=1.0)
for b in range(2, 8):
    drum(b, 0, 0, 58 + (b - 2) * 7)
for b in range(5, 8):
    for s in range(16):
        drum(b, s, 1, 36 + (b - 5) * 20 + s)
    add('bass', b * BAR, 38 + (b - 5) * 2, BAR * 0.9, 84)
crash(8, 96)

# --- A 8-18：riff（源 bar2-11）高位琶音 + 和弦
topA, restA = split_top(L['6'], 2, 12)
place('lead', topA, 2, 8, vel=118)
place('harm', restA, 2, 8, vel=96)
place('bass', ln(L['9'], 2, 12), 2, 8, vel=116)
place('pad', ln(L['4'], 2, 12), 2, 8, vel=56, dur_scale=1.0)
for i in range(10):
    groove(8 + i, 1, 'main' if i < 8 else 'drive')
fill(16, 2)
crash(8, 112)

# --- A2 19-29：riff + ch2 低八度加倍 + 半音琶音乱流
topA2, restA2 = split_top(L['6'], 2, 12)
place('lead', topA2, 2, 19, vel=120)
place('harm', restA2, 2, 19, vel=100)
place('harm', ln(L['2'], 2, 12), 2, 19, transpose=-12, vel=74, max_pitch=88)
place('bass', ln(L['9'], 2, 12), 2, 19, vel=118)
place('pad', ln(L['4'], 2, 12), 2, 19, vel=52, dur_scale=1.0)
for i in range(10):
    groove(19 + i, 1, 'drive')
for i, b in enumerate(range(25, 30)):
    for s in range(16):
        add('harm', b * BAR + s * BAR / 16, (96 - i * 3 - s) % 13 + 72, BAR / 16 * 0.5, 80)
fill(27, 2)
crash(19, 118)

# --- B 30-38：招牌主题（源 bar16-20）全奏，半拍鼓
place('lead', TH_TOP, 16, 31, vel=108)
place('harm', TH_REST, 16, 31, vel=92)
place('harm', ln(L['3'], 16, 21), 16, 31, vel=70, max_pitch=100)
place('bass', ln(L['9'], 16, 21), 16, 31, vel=100)
place('pad', ln(L['4'], 16, 21), 16, 31, vel=62, dur_scale=1.0)
for i in range(5):
    groove(31 + i, 1, 'half')
crash(30, 92)
# 36-38 半音爬升 build
for i in range(3):
    b = 36 + i
    for s in range(0, 16, 2):
        add('bass', b * BAR + s * BAR / 16, 36 + i * 2 + (12 if s >= 8 else 0), BAR / 16 * 1.7, 104 + i * 4)
    for s in range(16):
        drum(b, s, 1, 56 + i * 12 + s * 2)
    drum(b, 0, 0, 112)
    drum(b, 8, 0, 100)
crash(39, 108)

# --- C 39-52：狂奔（源 bar21-34）
topC, restC = split_top(L['6'], 21, 35)
place('lead', topC, 21, 39, vel=122)
place('harm', restC, 21, 39, vel=100)
place('bass', ln(L['9'], 21, 35), 21, 39, vel=118)
place('pad', ln(L['4'], 21, 35), 21, 39, vel=48, dur_scale=1.0)
for i in range(14):
    groove(39 + i, 1, 'drive')
crash(39, 116)
for i, b in enumerate(range(47, 53)):
    for s in range(16):
        add('harm', b * BAR + s * BAR / 16, (98 - i * 2 - s) % 13 + 72, BAR / 16 * 0.5, 84)

# --- D 53-56：力量桥，半音下行 + 双脚鼓
for i, b in enumerate(range(53, 57)):
    m = 50 - i * 2
    for s in range(16):
        add('bass', b * BAR + s * BAR / 16, m - (s % 4), BAR / 16 * 0.8, 116)
    for s in range(16):
        drum(b, s, 0, 118 if s % 2 == 0 else 96)
    for s in (4, 12):
        drum(b, s, 1, 112)
    for s in range(16):
        drum(b, s, 2, 76)
fill(55, 2, 80, 3)
crash(53, 112)

# --- E 57-64：囚禁 495 年。只剩音乐盒 + 心跳
place('pad', TH_TOP, 16, 57, transpose=12, vel=56, dur_scale=1.0, max_pitch=104)
place('pad', ln(L['4'], 16, 21), 16, 57, vel=40, dur_scale=1.0)
for i in range(6):
    groove(57 + i, 1, 'quiet')
for b in range(63, 65):
    for s in range(16):
        drum(b, s, 1, 36 + (s + (b - 63) * 16) * 4)
    drum(b, 0, 0, 92)
crash(57, 64)

# --- F 65-75：终局 riff + 八度加倍 + 全奏
topF, restF = split_top(L['6'], 2, 12)
place('lead', topF, 2, 65, vel=124)
place('harm', restF, 2, 65, vel=104)
place('harm', ln(L['2'], 2, 12), 2, 65, transpose=12, vel=76, max_pitch=104)
place('bass', ln(L['9'], 2, 12), 2, 65, vel=120)
place('pad', ln(L['4'], 2, 12), 2, 65, vel=54, dur_scale=1.0)
for i in range(10):
    groove(65 + i, 1, 'final' if i >= 6 else 'drive')
fill(74, 2, 84, 3)
crash(65, 120)

# --- G 76-86：后段狂奔（源 bar65-76，全曲最烈的琶音区）
topG, restG = split_top(L['6'], 65, 76)
place('lead', topG, 65, 76, vel=124)
place('harm', restG, 65, 76, vel=104)
place('harm', ln(L['2'], 65, 76), 65, 76, transpose=12, vel=72, max_pitch=104)
place('bass', ln(L['9'], 65, 76), 65, 76, vel=120)
place('pad', ln(L['4'], 65, 76), 65, 76, vel=48, dur_scale=1.0)
for i in range(11):
    groove(76 + i, 1, 'final')
for i, b in enumerate(range(82, 87)):
    for s in range(16):
        add('harm', b * BAR + s * BAR / 16, (100 - i * 3 - s) % 13 + 72, BAR / 16 * 0.5, 86)
crash(76, 120)

# --- T 87-95：凋零，主题尾巴的音乐盒
place('pad', [(b, bt, m, be, v) for (b, bt, m, be, v) in TH_TOP[:6]], 16, 87, transpose=12, vel=58, dur_scale=1.0, max_pitch=104)
place('pad', ln(L['4'], 16, 18), 16, 89, vel=42, dur_scale=1.0)
for b in range(87, 90):
    for s in range(16):
        drum(b, s, 1, 96 - (b - 87) * 22 + s)
    drum(b, 0, 0, 100)
crash(87, 88)

'''
s = s[:i0] + new + s[i1:]
io.open(p,'w',encoding='utf-8',newline='\r\n').write(s)
print('section block replaced')
