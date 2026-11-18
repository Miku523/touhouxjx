# -*- coding: utf-8 -*-
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, 'midi_flat.json'), encoding='utf-8'))
notes = D['notes']
def block(b0, n=8):
    out = []
    for b in range(b0, b0+n):
        xs = sorted([x for x in notes if x['bar']==b and x['ch'] in (10,11,12)], key=lambda x:(x['beat'], x['m']))
        out.append(tuple((round(x['beat'],2), x['m']) for x in xs))
    return out
def cmp(a0, b0, n=8):
    A, B = block(a0, n), block(b0, n)
    eq = sum(1 for x,y in zip(A,B) if x==y)
    return '%d vs %d: identical bars %d/%d' % (a0, b0, eq, n)
print(cmp(65, 73)); print(cmp(81, 89)); print(cmp(89, 97)); print(cmp(97, 105)); print(cmp(49, 57)); print(cmp(57, 65))
# ch11 十六分素材是否在 83-112 内循环
for a in (83, 85, 87, 89, 91, 93, 95, 97, 101, 105, 109):
    print('ch11 bar %d first beats:' % a, [(round(x['beat'],2), x['m']) for x in sorted([x for x in notes if x['bar']==a and x['ch']==11], key=lambda x:x['beat'])[:6]])
