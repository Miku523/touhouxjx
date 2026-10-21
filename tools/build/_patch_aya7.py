# -*- coding: utf-8 -*-
"""加 AYA_NOLIFT=1：D 段不抬三度（F#m 原调），用于与游戏内 8bit 原曲叠加试听。
原曲 D 段是 F#m，新版若抬到 Am，叠在一起会撞大三度，所以融合试听要用原调版。"""
P = r'C:\Users\GuSheng\Downloads\HKS\tools\aya_stage4.py'
t = open(P, 'rb').read().decode('utf-8').replace('\r\n', '\n')

old_out = """OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs',
                      'aya_stage4_v2.js' if os.environ.get('AYA_V', '1') == '2' else 'aya_stage4.js')"""
new_out = """_SUF = '_v2' if os.environ.get('AYA_V', '1') == '2' else ('_fb' if os.environ.get('AYA_NOLIFT') else '')
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'aya_stage4' + _SUF + '.js')

# D 段抬调量：default 3（F#m→Am）；AYA_NOLIFT=1 时不抬，和游戏内原曲同调
LIFT = 0 if os.environ.get('AYA_NOLIFT') else 3"""

old_d = """    chords = PROG_DA
    mel('lead', FS_THEME, b0, transpose=3, vel=123, dur_scale=1.0, max_pitch=104)"""
new_d = """    chords = PROG_DA if LIFT else PROG_D
    mel('lead', FS_THEME, b0, transpose=LIFT, vel=123, dur_scale=1.0, max_pitch=104)"""

old_w = """    for (rb, si, m, ls) in FS_THEME:
        mm = m + 15 if m + 15 <= 100 else m + 3"""
new_w = """    for (rb, si, m, ls) in FS_THEME:
        mm = m + LIFT + 12 if m + LIFT + 12 <= 100 else m + LIFT"""

for old, new in ((old_out, new_out), (old_d, new_d), (old_w, new_w)):
    assert old in t, 'not found: ' + old.split('\n')[0][:60]
    t = t.replace(old, new, 1)
open(P, 'wb').write(t.replace('\n', '\r\n').encode('utf-8'))
print('AYA_NOLIFT 已加入')
