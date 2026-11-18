# -*- coding: utf-8 -*-
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, 'midi_flat.json'), encoding='utf-8'))
notes = D['notes']
def monoseq(chs, b0, b1):
    # 单声部近似：每小节取最高音的序列
    out = []
    for b in range(b0, b1+1):
        xs = [n for n in notes if n['bar']==b and n['ch'] in chs]
        if not xs: out.append(None); continue
        xs.sort(key=lambda n:(n['beat'], -n['m']))
        out.append(tuple(n['m'] for n in xs))
    return out
def same(a, b, k=0):
    return all(x == (tuple(v+k for v in y) if y else y) if x and y else x==y for x,y in zip(a,b))
for chs, rng in [((0,), (1,8)), ((0,), (9,16)), ((3,), (17,24)), ((3,), (25,32)), ((12,), (49,56)), ((12,), (57,64)), ((10,), (81,88)), ((10,), (89,96))]:
    b0, b1 = rng
    a = monoseq(chs, b0, b0+7)
    print(chs, '%d-%d' % (b0, b1), 'notes/bar:', [len(x) if x else 0 for x in a])
# 段落内部前后 8 小节是否相同
pairs = [((0,),(1,9)), ((0,),(33,41)), ((3,),(17,25)), ((12,),(49,57)), ((12,),(65,73)), ((10,),(81,89)), ((10,),(89,97)), ((11,),(83,91))]
for chs, (a0, b0) in pairs:
    A = monoseq(chs, a0, a0+7); B = monoseq(chs, b0, b0+7)
    print(chs, a0, 'vs', b0, 'identical' if same(A,B) else 'diff')
