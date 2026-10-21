# -*- coding: utf-8 -*-
import json,sys
sys.stdout.reconfigure(encoding='utf-8',errors='replace')
d=json.load(open('tools/build/_un_orig.json',encoding='utf-8'))
B=60.0/d['bpm']*4
nn=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def nm(v): return nn[v%12]+str(v//12-1)
for ch in ('6',):
    for b0,b1 in ((14,22),(21,26),(35,46),(55,65),(65,80)):
        print('\nch%s bar%d-%d'%(ch,b0,b1))
        row=[]
        for t,m,du,v in d['channels'][ch]['notes']:
            bb=t/B
            if b0-1<=bb<b1-1:
                row.append('%d.%d:%s'%(int(bb)+1,round((bb%1)*4),nm(m)))
        for i in range(0,len(row),6): print('  '+' '.join(row[i:i+6]))
