# -*- coding: utf-8 -*-
"""v7b：副歌 II 主旋律加八度加厚 + 末两小节半音下行过门 + 钟摆可闻"""
import io

P = 'tools/build/_cirno_compose.py'
src = io.open(P, encoding='utf-8').read()


def sub(old, new, cnt=1):
    global src
    assert src.count(old) == cnt, (src.count(old), old[:70])
    src = src.replace(old, new)


# 1) 副歌 II 后半：升八度的同时保留原八度加厚（否则高音区能量反而不如第一遍）
sub("""            else:
                add('strings', t, mm, db * BEAT * 0.9, int(v * 0.42))
                add('piano', t, mm + 12 if mm + 12 <= 104 else mm, db * BEAT * 0.9, int(v * 0.34))""",
    """            else:
                add('lead', t, m, db * BEAT * 0.92, int(v * 0.54))
                add('strings', t, mm, db * BEAT * 0.9, int(v * 0.42))
                add('piano', t, mm + 12 if mm + 12 <= 104 else mm, db * BEAT * 0.9, int(v * 0.34))""")

# 2) 副歌 II 末两小节：半音下行过门（弦乐 + 对旋律 + 铜管上行收尾）
sub("""    # 段尾推进
    dr_roll(b0 + 7, 2.5, 1.5, 50, 120)""",
    """    if hero:
        # 末两小节半音下行过门（原来两遍副歌逐音相同，结尾要做点「鬼畜」文章）
        chrom = [80, 79, 78, 77, 76, 75, 75, 74]
        for i, m in enumerate(chrom):
            t = bt(b0 + 6, 2.0 + i * 0.25)
            add('strings', t, m, 0.10, 46)
            add('counter', t, m - 12, 0.10, 40)
        for i, m in enumerate([74, 75, 76, 77, 78, 79]):
            add('brass', bt(b0 + 7, 2.5 + i * 0.25), m, 0.10, 54)
    # 段尾推进
    dr_roll(b0 + 7, 2.5, 1.5, 50, 120)""")

# 3) 钟摆音量（B–E 段新加的 tick 原来 -58dB，等于没有）
sub("    ('tick', 'square', 0.070),", "    ('tick', 'square', 0.095),")
sub("""        add('tick', bt(bar, 1.75), 93, 0.09, 24)
        add('tick', bt(bar, 3.75), 93, 0.09, 22)""",
    """        add('tick', bt(bar, 1.75), 93, 0.09, 40)
        add('tick', bt(bar, 3.75), 93, 0.09, 34)""")

io.open(P, 'w', encoding='utf-8').write(src)
print('patched v7b', len(src))
