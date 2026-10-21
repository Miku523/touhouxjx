# -*- coding: utf-8 -*-
"""v11 融合版：把游戏内 8bit 原曲的「副旋律层」（track2 square 0.05，538 音）
顶替掉新编曲里最不重要的 sine 铺底 —— 引擎最多 4 个旋律声部，换而不加。

这样：鼓 / 贝斯 / 主旋律都是新编的，第四条声部是原曲自己的第二旋律，
听感上就同时有「新版的人物感」和「游戏原曲的味道」。
"""
P = r'C:\Users\GuSheng\Downloads\HKS\tools\aya_stage4.py'
t = open(P, 'rb').read().decode('utf-8').replace('\r\n', '\n')

old = """fill_lead_gaps(6, 88)
S.finish()"""

new = """fill_lead_gaps(6, 88)

# ---------------------------------------------------------------- 融合模式
# AYA_FUSION=1：用游戏内原曲（src/engine/songs/touhou.js BOSS_SONGS.stage4）
# 的副旋律层替代 sine 铺底。引擎上限 4 个旋律声部，所以是「换」不是「加」。
if os.environ.get('AYA_FUSION'):
    _old = json.load(open(os.path.join(ROOT, 'tools', 'build', '_old_stage4.json'), encoding='utf-8'))
    _src = _old['tracks'][2]          # 原曲第三条轨：square 0.05 的副旋律
    _notes = []
    for (_t, _m, _d, _v) in _src['notes']:
        if _t < S.duration - 1e-6:
            _notes.append([round(_t, 4), int(_m), round(min(_d, 2.0), 4), int(_v)])
    S.tracks['pad'] = {'wave': 'square', 'gain': 0.05, 'notes': _notes}
    print('融合模式：pad 换成原曲副旋律 %d 音' % len(_notes))

S.finish()"""

assert old in t
t = t.replace(old, new, 1)

# 输出文件名加 _mix 后缀
old2 = """_SUF = '_v2' if os.environ.get('AYA_V', '1') == '2' else ('_fb' if os.environ.get('AYA_NOLIFT') else '')"""
new2 = """_SUF = '_v2' if os.environ.get('AYA_V', '1') == '2' else ('_fb' if os.environ.get('AYA_NOLIFT') else '')
if os.environ.get('AYA_FUSION'):
    _SUF += '_mix'"""
assert old2 in t
t = t.replace(old2, new2, 1)

open(P, 'wb').write(t.replace('\n', '\r\n').encode('utf-8'))
print('AYA_FUSION 已加入')
