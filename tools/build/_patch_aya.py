# -*- coding: utf-8 -*-
"""一次性补丁：把 aya_stage4.py 各段和声换成原曲逐小节真实进行（PROG_A/B/C/D）。"""
import io
import os

P = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                 'aya_stage4.py')
raw = open(P, 'rb').read().decode('utf-8')
crlf = '\r\n' in raw
t = raw.replace('\r\n', '\n')

edits = [
    # A 段
    ("    chords = ch(13, 16) if not V2 else LOOP_FM\n    mel('lead', HEAD_A, b0, vel=118, dur_scale=0.94)",
     "    chords = PROG_A\n    mel('lead', HEAD_A, b0, vel=118, dur_scale=0.94)"),
    # D 段
    ("    if V2:\n        chords = LOOP_AM\n"
     "        mel('lead', FS_THEME, b0, transpose=3, vel=122, dur_scale=1.0, max_pitch=100)\n"
     "    else:\n        chords = ch(84, 16)\n"
     "        mel('lead', FS_THEME, b0, vel=122, dur_scale=1.0, max_pitch=100)",
     "    chords = PROG_D\n"
     "    mel('lead', FS_THEME, b0, vel=122, dur_scale=1.0, max_pitch=100)"),
    ("    # 风嗓：主题高八度的尖啸\n    dt = 3 if V2 else 0",
     "    # 风嗓：主题高八度的尖啸（跟原调，不加三度）\n    dt = 0"),
    # E 段
    ("    chords = ch(13, 16) if not V2 else LOOP_FM\n"
     "    mel('lead', HEAD_A, b0, transpose=12, vel=121, dur_scale=1.0)",
     "    chords = PROG_A\n"
     "    mel('lead', HEAD_A, b0, transpose=12, vel=121, dur_scale=1.0)"),
    # C 段风嗓收尾用真实和声
    ("    wind_run(b0 + 14, 'Cm7', base=76, vel=66)\n"
     "    wind_run(b0 + 15, 'Cm7', base=79, vel=70)",
     "    wind_run(b0 + 14, prog[14], base=76, vel=66)\n"
     "    wind_run(b0 + 15, prog[15], base=79, vel=70)"),
    # prog_at 改查表
    ("    sec = (bar - 8) // 16\n"
     "    src = {0: 13, 1: 29, 2: 52, 3: 84, 4: 13}.get(sec, 13)\n"
     "    return 'B%d' % _near(src + (bar - 8 - sec * 16))",
     "    sec = (bar - 8) // 16\n"
     "    idx = (bar - 8) % 16\n"
     "    table = [PROG_A, PROG_B, PROG_C, PROG_D, PROG_A]\n"
     "    return table[sec][idx] if 0 <= sec < len(table) else 'Fm7'"),
]

for old, new in edits:
    if old not in t:
        print('MISS:', old.split('\n')[0])
        continue
    t = t.replace(old, new, 1)
    print('ok  :', old.split('\n')[0][:60])

out = t.replace('\n', '\r\n') if crlf else t
open(P, 'wb').write(out.encode('utf-8'))
print('written', P, 'crlf=', crlf)
