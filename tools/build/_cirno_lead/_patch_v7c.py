# -*- coding: utf-8 -*-
"""v7c：第二遍副歌后半加 16 分邻音装饰，让旋律真正不同（原来只是加厚）"""
import io

P = 'tools/build/_cirno_compose.py'
src = io.open(P, encoding='utf-8').read()
old = """            else:
                add('lead', t, m, db * BEAT * 0.92, int(v * 0.54))
                add('strings', t, mm, db * BEAT * 0.9, int(v * 0.42))
                add('piano', t, mm + 12 if mm + 12 <= 104 else mm, db * BEAT * 0.9, int(v * 0.34))"""
new = """            else:
                add('lead', t, m, db * BEAT * 0.92, int(v * 0.54))
                add('strings', t, mm, db * BEAT * 0.9, int(v * 0.42))
                add('piano', t, mm + 12 if mm + 12 <= 104 else mm, db * BEAT * 0.9, int(v * 0.34))
                # 16 分邻音装饰：第二遍副歌后半不是「同一句加厚」，而是真的换了写法
                nb = mm - 2 if (mm - 2) % 12 in (2, 4, 5, 7, 9, 10, 0, 1) else mm + 2
                if 60 <= nb <= 104:
                    add('lead', t + BEAT * 0.25, nb, BEAT * 0.16, int(v * 0.46))"""
assert src.count(old) == 1
src = src.replace(old, new)
io.open(P, 'w', encoding='utf-8').write(src)
print('patched v7c')
