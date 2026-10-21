# -*- coding: utf-8 -*-
import json,sys
sys.stdout.reconfigure(encoding='utf-8',errors='replace')
d=json.load(open('tools/build/_un_orig.json',encoding='utf-8'))
B=60.0/d['bpm']*4
nn=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def nm(v): return nn[v%12]+str(v//12-1)
# ch6 与 ch10 是否完全一致
a=[(round(t,3),m) for t,m,du,v in d['channels']['6']['notes']]
b=[(round(t,3),m) for t,m,du,v in d['channels']['10']['notes']]
print('ch6 vs ch10 完全一致：', a==b, len(a), len(b))
if a!=b:
    diff=[(x,y) for x,y in zip(a,b) if x!=y][:5]
    print('  前几处差异', diff)
# 各通道每小节音数（0-30）
print('\n每小节音数（bar1-30）：')
print('     '+''.join('%4d'%(b+1) for b in range(30)))
for ch in ('1','2','3','4','5','6','8','9','13','14','15'):
    cnt={}
    for t,m,du,v in d['channels'][ch]['notes']:
        b=int(t/B); cnt[b]=cnt.get(b,0)+1
    print('ch%-3s'%ch+''.join('%4d'%(cnt.get(b,0)) for b in range(30)))
# dump ch5 ch8 ch13 前 30
for ch in ('5','8','13'):
    print('\nch%s：'%ch)
    row=[]
    for t,m,du,v in d['channels'][ch]['notes'][:36]:
        bb=t/B
        row.append('b%d.%d:%s'%(int(bb)+1,round((bb%1)*4),nm(m)))
    for i in range(0,len(row),6): print('  '+' '.join(row[i:i+6]))
