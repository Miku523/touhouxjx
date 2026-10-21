# -*- coding: utf-8 -*-
"""v10：中间转调段真的「上去」——整段上移大三度 F#m→Am，鼓组加密。

用户反馈（m00713）：「拍子跟不上，中间调子还没上去」。
→ 旋律在 D 段 +3 半音（F#m→Am 域），和弦同步换成 Am7-F-G-Am；
→ D 段踩镲改 16 分、段末加军鼓 16 分花，音轨不再被旋律甩在后面。
"""
P = r'C:\Users\GuSheng\Downloads\HKS\tools\aya_stage4.py'
t = open(P, 'rb').read().decode('utf-8').replace('\r\n', '\n')

old_prog = """PROG_D = ['F#m7', 'D', 'E', 'F#m', 'F#m', 'D', 'E', 'F#m',
          'F#m', 'D', 'E', 'F#m', 'F#m7', 'D', 'E', 'F#m']"""
new_prog = """PROG_D = ['F#m7', 'D', 'E', 'F#m', 'F#m', 'D', 'E', 'F#m',
          'F#m', 'D', 'E', 'F#m', 'F#m7', 'D', 'E', 'F#m']
# D 段实际演奏用「上移大三度」版本（F#m7 D E F#m → Am7 F G Am），
# 这是原曲与四首参考共有的「副歌起飞」手法
PROG_DA = ['Am7', 'F', 'G', 'Am', 'Am', 'F', 'G', 'Am',
           'Am', 'F', 'G', 'Am', 'Am7', 'F', 'G', 'Am']"""

old_d = '''def section_D(b0=56):
    """D：转调 F# 小调，原曲的戏剧高点，主旋律保持原音区。"""
    chords = PROG_D
    mel('lead', FS_THEME, b0, vel=122, dur_scale=1.0, max_pitch=100)
    for i, c in enumerate(chords):
        b = b0 + i
        bass(b, c, 'push8', vel=110)
        pad_long(b, c, bars=1)
        if i < 12:
            wind_arp(b, c, base=60, vel=50, sub=2)
    # 风嗓：主题高八度的尖啸（跟原调，不加三度）
    dt = 0
    for (rb, si, m, ls) in FS_THEME:
        mm = m + dt + 12 if m + dt + 12 <= 96 else m + dt
        S.add('wind', b0 + rb, si, mm, max(1, round(ls * 0.55)), 52)
    drums_drive(b0, 16, hat16=False)'''

new_d = '''def section_D(b0=56):
    """D：整段上移大三度（F#m 域 → Am 域），原曲和四首参考都在这里「起飞」；
    踩镲加密到 16 分、段末军鼓 16 分加花，节奏不再被旋律甩在后面。"""
    chords = PROG_DA
    mel('lead', FS_THEME, b0, transpose=3, vel=123, dur_scale=1.0, max_pitch=104)
    for i, c in enumerate(chords):
        b = b0 + i
        bass(b, c, 'push8', vel=112)
        pad_long(b, c, bars=1)
        if i < 12:
            wind_arp(b, c, base=60, vel=50, sub=2)
    # 风嗓：主题上移三度后再高八度
    for (rb, si, m, ls) in FS_THEME:
        mm = m + 15 if m + 15 <= 100 else m + 3
        S.add('wind', b0 + rb, si, mm, max(1, round(ls * 0.55)), 52)
    drums_drive(b0, 16, hat16=True)
    # 段末加花：16 分军鼓渐强，推回 F 小调的 E 段
    for s in range(16):
        S.drum(b0 + 15, s, 1, 58 + s * 3)'''

for old, new in ((old_prog, new_prog), (old_d, new_d)):
    assert old in t, 'not found: ' + old.split('\n')[0][:50]
    t = t.replace(old, new, 1)
open(P, 'wb').write(t.replace('\n', '\r\n').encode('utf-8'))
print('v10 patched')
