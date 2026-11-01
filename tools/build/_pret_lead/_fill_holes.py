# -*- coding: utf-8 -*-
import io, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

# ---- pre2 ----
p2 = os.path.join(ROOT, 'tools/build/_pret2_compose.py')
s = io.open(p2, encoding='utf-8').read()
anchor2 = "    # ---- 尾声 69-70：雾散、萤火仍在 ----"
assert s.count(anchor2) == 1
fill2 = '''    # ---- 主体开头的空拍（原曲 bar1-2 本身是休止）：雾不能空 ----
    fill_r = None
    for sb in range(9, 25):
        if sb in roots:
            fill_r = roots[sb]
            break
    if fill_r is None:
        fill_r = 45
    while fill_r < 33:
        fill_r += 12
    while fill_r > 45:
        fill_r -= 12
    for nb in (5, 6):
        t0 = s.bt(nb)
        for i, dm in enumerate((0, 7, 12, 15)):
            s.add('pad', t0, fill_r + dm, s.bar * 0.99, 40 - i * 4)
        s.add('sub', t0, fill_r - 12, s.bar * 0.99, 54)
        s.add('bass', t0, fill_r, s.bar * 0.95, 56)
        s.add('choir', t0, fill_r + 24, s.bar * 0.9, 24)
        s.drum(t0, 0, 66)
        s.drum(t0 + 2 * s.beat, 0, 54)
    for i in range(32):
        b = 5 + i // 16
        t = s.bt(b) + (i % 16) * 0.125 * s.beat
        s.add('bell', t, fy[(i * 3) % 8], 0.10, 26 if i % 2 else 38)
    s.add('riser', s.bt(6, 2.0), 74, 2.0 * s.beat, 26)

'''
s = s.replace(anchor2, fill2 + anchor2)
io.open(p2, 'w', encoding='utf-8', newline='\n').write(s)

# ---- pre3 ----
p3 = os.path.join(ROOT, 'tools/build/_pret3_compose.py')
s = io.open(p3, encoding='utf-8').read()
anchor3 = "    # ---- 尾声 55-56：雾散 ----"
assert s.count(anchor3) == 1
fill3 = '''    # ---- 主体开头的空拍（原曲 bar1-2 本身是休止）：冰面留白 ----
    for nb in (3, 4):
        t0 = s.bt(nb)
        for i, dm in enumerate((0, 7, 12, 15)):
            s.add('pad', t0, r0 + dm, s.bar * 0.99, 42 - i * 4)
        s.add('sub', t0, r0 - 12, s.bar * 0.99, 54)
        s.add('bass', t0, r0, s.bar * 0.95, 54)
        s.add('choir', t0, r0 + 24, s.bar * 0.9, 26)
        s.drum(t0, 0, 68)
        s.drum(t0 + 2 * s.beat, 0, 56)
    for i in range(32):
        b = 3 + i // 16
        t = s.bt(b) + (i % 16) * 0.125 * s.beat
        s.add('bell', t, ice[(i * 3) % 8], 0.10, 24 if i % 2 else 36)
    for i in range(8):
        s.add('tick', s.bt(3 + i // 4, (i % 4) * 0.5), 93, 0.06, 36 if i % 2 == 0 else 24)
    s.add('riser', s.bt(4, 2.0), 74, 2.0 * s.beat, 28)

'''
s = s.replace(anchor3, fill3 + anchor3)
io.open(p3, 'w', encoding='utf-8', newline='\n').write(s)
print('patched both')
