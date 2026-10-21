# -*- coding: utf-8 -*-
import json, sys
from collections import Counter
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
d=json.load(open('tools/build/_un_orig.json',encoding='utf-8'))
B=60.0/d['bpm']*4
nn=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def dump(ch,b0,b1,n=60):
    print('\nch%s  bar%d-%d'%(ch,b0,b1))
    c=0
    for t,m,du,v in d['channels'][ch]['notes']:
        bb=t/B
        if b0-1<=bb<b1-1:
            print('  b%02d.%02d %-4s %.3f'%(int(bb)+1,(bb%1)*4,nn[m%12]+str(m//12-1),du),end='')
            c+=1
            if c%4==0: print()
    print()
for ch in ('9','1','3','4','2'):
    dump(ch,1,4)
# 每小节最低音（ch9）
print('\nch9 每小节音级集合（前 20 小节）')
for b in range(20):
    s=[m for t,m,du,v in d['channels']['9']['notes'] if b<=t/B-1<b+1]
    if s:
        pcs=sorted(set(m%12 for m in s))
        print('  bar%-2d 低%d 高%d 音级%s'%(b+1,min(s),max(s),' '.join(nn[p] for p in pcs)))
