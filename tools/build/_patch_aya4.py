# -*- coding: utf-8 -*-
"""v8：拍速回到原曲 154，副旋律（风轮）从 16 分降到 8 分并压低。

用户反馈（m00663）：「副旋律太快了……节拍过快导致无法匹配」。
病根：编曲用了 168 BPM，而旋律是照 154 BPM 的原曲网格搬过来的，
      16 分音符被整体加速 9%，听感上就是「副旋律抢拍、对不上原曲」。
"""
P = r'C:\Users\GuSheng\Downloads\HKS\tools\aya_stage4.py'
t = open(P, 'rb').read().decode('utf-8').replace('\r\n', '\n')

edits = [
    # 拍速回到原曲
    ('BPM = 168.0', 'BPM = 154.0   # 与原曲《風神少女》完全一致，音符时值不再被加速'),
    # 风轮音量降一档
    ("'wind': {'wave': 'sawtooth', 'gain': 0.07, 'notes': []},",
     "'wind': {'wave': 'sawtooth', 'gain': 0.055, 'notes': []},"),
    # C 段末两小节的风轮改 8 分
    ('        wind_arp(b, prog[b - b0], base=72, vel=50, sub=1)',
     '        wind_arp(b, prog[b - b0], base=72, vel=46, sub=2)'),
    # 各段主旋律高八度叠奏压低，别当成一条副旋律抢戏
    ("        S.add('wind', b0 + rb, si, m + 12, max(1, round(ls * 0.5)), 58)",
     "        S.add('wind', b0 + rb, si, m + 12, max(1, round(ls * 0.5)), 48)"),
    ("        S.add('wind', b0 + rb, si, mm, max(1, round(ls * 0.5)), 56)",
     "        S.add('wind', b0 + rb, si, mm, max(1, round(ls * 0.5)), 46)"),
    ("        S.add('wind', b0 + rb, si, mm, max(1, round(ls * 0.55)), 64)",
     "        S.add('wind', b0 + rb, si, mm, max(1, round(ls * 0.55)), 52)"),
    ("""        S.add('wind', b0 + rb, si, m + 12 if m + 12 <= 100 else m,
              max(1, round(ls * 0.45)), 60)""",
     """        S.add('wind', b0 + rb, si, m + 12 if m + 12 <= 100 else m,
              max(1, round(ls * 0.45)), 50)"""),
]
for old, new in edits:
    if old not in t:
        print('MISS:', old.strip().split('\n')[0][:70])
        continue
    t = t.replace(old, new, 1)
    print('ok  :', old.strip().split('\n')[0][:70])
open(P, 'wb').write(t.replace('\n', '\r\n').encode('utf-8'))
print('v8 patched')
