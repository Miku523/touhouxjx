# -*- coding: utf-8 -*-
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, 'midi_flat.json'), encoding='utf-8'))
notes = D['notes']
def seq(ch, b0, b1, n=24):
    xs = [x for x in notes if x['ch']==ch and b0 <= x['bar'] <= b1]
    xs.sort(key=lambda x:(x['bar'], x['beat'], x['m']))
    return [(x['bar']-b0, x['beat'], x['m']) for x in xs][:n]
def diff(a, b):
    if not a or not b: return None
    return sorted(set(y[2]-x[2] for x, y in zip(a, b)))[:5]
print('ch12 49-52 :', seq(12,49,52))
print('ch10 83-86 :', seq(10,83,86))
print('ch11 83-86 :', seq(11,83,86))
print('shift ch12->ch10:', diff(seq(12,49,52), seq(10,83,86)))
print('ch12 53-56 :', seq(12,53,56))
print('ch11 87-90 :', seq(11,87,90))
print('ch0 1-4    :', seq(0,1,4))
print('ch0 33-36  :', seq(0,33,36))
print('shift 1-4->33-36:', diff(seq(0,1,4), seq(0,33,36)))
print('ch3 17-20  :', seq(3,17,20))
print('ch3 1-4    :', seq(3,1,4))
print('shift 1-4->17-20:', diff(seq(3,1,4), seq(3,17,20)))
