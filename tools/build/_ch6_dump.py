# -*- coding: utf-8 -*-
import json,sys
sys.stdout.reconfigure(encoding='utf-8',errors='replace')
mid=json.load(open('tools/build/_un_orig.json',encoding='utf-8'))
BAR=240/155
NN=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def name(m): return NN[m%12]+str(m//12-1)
for ch in ('6',):
    ns=mid['channels'][ch]['notes']
    for b in range(0,80):
        sel=[n for n in ns if b*BAR<=n[0]<(b+1)*BAR]
        if not sel: continue
        if 14<=b<=22 or b in (0,1,2,10,11,20,21,22):
            print('bar%2d (%5.1f-%5.1fs): '%(b,b*BAR,(b+1)*BAR)+' '.join('%s%.2f'%(name(n[1]),n[2]) for n in sel[:14]))
