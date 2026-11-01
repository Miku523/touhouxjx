# -*- coding: utf-8 -*-
import io, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

p2 = os.path.join(ROOT, 'tools/build/_pret2_compose.py')
s = io.open(p2, encoding='utf-8').read()
old2 = """        for i, dm in enumerate((0, 7, 12, 15)):
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
    s.add('riser', s.bt(6, 2.0), 74, 2.0 * s.beat, 26)"""
new2 = """        for i, dm in enumerate((0, 7, 12, 15)):
            s.add('pad', t0, fill_r + dm, s.bar * 0.99, 92 - i * 6)
        s.add('sub', t0, fill_r - 12, s.bar * 0.99, 92)
        s.add('bass', t0, fill_r, s.bar * 0.95, 100)
        s.add('choir', t0, fill_r + 24, s.bar * 0.9, 48)
        s.drum(t0, 0, 98)
        s.drum(t0 + 2 * s.beat, 0, 82)
    for i in range(32):
        b = 5 + i // 16
        t = s.bt(b) + (i % 16) * 0.125 * s.beat
        s.add('bell', t, fy[(i * 3) % 8], 0.10, 46 if i % 2 else 66)
    s.add('riser', s.bt(6, 2.0), 74, 2.0 * s.beat, 38)"""
assert s.count(old2) == 1
io.open(p2, 'w', encoding='utf-8', newline='\n').write(s.replace(old2, new2))

p3 = os.path.join(ROOT, 'tools/build/_pret3_compose.py')
s = io.open(p3, encoding='utf-8').read()
old3 = """        for i, dm in enumerate((0, 7, 12, 15)):
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
    s.add('riser', s.bt(4, 2.0), 74, 2.0 * s.beat, 28)"""
new3 = """        for i, dm in enumerate((0, 7, 12, 15)):
            s.add('pad', t0, r0 + dm, s.bar * 0.99, 94 - i * 6)
        s.add('sub', t0, r0 - 12, s.bar * 0.99, 90)
        s.add('bass', t0, r0, s.bar * 0.95, 98)
        s.add('choir', t0, r0 + 24, s.bar * 0.9, 50)
        s.drum(t0, 0, 96)
        s.drum(t0 + 2 * s.beat, 0, 80)
    for i in range(32):
        b = 3 + i // 16
        t = s.bt(b) + (i % 16) * 0.125 * s.beat
        s.add('bell', t, ice[(i * 3) % 8], 0.10, 44 if i % 2 else 64)
    for i in range(8):
        s.add('tick', s.bt(3 + i // 4, (i % 4) * 0.5), 93, 0.06, 52 if i % 2 == 0 else 36)
    s.add('riser', s.bt(4, 2.0), 74, 2.0 * s.beat, 38)"""
assert s.count(old3) == 1
io.open(p3, 'w', encoding='utf-8', newline='\n').write(s.replace(old3, new3))
print('boosted')
