# -*- coding: utf-8 -*-
import json, collections
src = json.load(open('tools/build/_pret_ref/necrofantasia/midi_flat.json', encoding='utf-8'))
notes = src['notes']
segs = [('A',2,17),('B',18,33),('A2',34,49),('C',50,65),('C2',66,81),('D',82,97),('D2',98,113),('END',114,116)]
for nm,lo,hi in segs:
    sub=[n for n in notes if lo<=n['bar']<=hi]
    # 用 amp=(0.4+0.6*v/127) 折算「响度能量」
    e=sum((0.4+0.6*n['v']/127.0)**2 for n in sub)
    print('%-4s bars %3d-%3d notes %4d  avg_vel %5.1f  energy %7.1f  energy/bar %6.1f' % (nm,lo,hi,len(sub), sum(n['v'] for n in sub)/len(sub), e, e/(hi-lo+1)))
