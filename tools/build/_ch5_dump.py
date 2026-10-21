# -*- coding: utf-8 -*-
import json,sys
sys.stdout.reconfigure(encoding='utf-8',errors='replace')
mid=json.load(open('tools/build/_un_orig.json',encoding='utf-8'))
ns=mid['channels']['5']['notes']
NN=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def name(m): return NN[m%12]+str(m//12-1)
print('ch5 共%d音，%.2f-%.2fs'%(len(ns),ns[0][0],ns[-1][0]))
for i in range(0,len(ns),6):
    row=ns[i:i+6]
    print('  %6.2fs '%row[0][0] + ' '.join('%s(%.2f)'%(name(n[1]),n[2]) for n in row))
