# -*- coding: utf-8 -*-
import json, sys
import numpy as np, soundfile as sf
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
SR=44100
x,sr=sf.read('tools/build/un_preview.wav',always_2d=True)
m=x.mean(axis=1)
print('峰值 %.3f  rms %.4f'%(np.abs(m).max(), np.sqrt((m**2).mean())))
d=json.load(open('tools/build/_un_flandre.json',encoding='utf-8'))
BAR=60.0/d['bpm']*4
SEC=[('intro',0,8),('A',8,19),('A2',19,30),('B',30,39),('C',39,53),('D',53,57),('E',57,65),('F',65,76),('G',76,87),('T',87,96)]
print('\n段落 rms / 鼓 / 主旋律音数')
for name,b0,b1 in SEC:
    t0,t1=b0*BAR,b1*BAR
    seg=m[int(t0*SR):int(t1*SR)]
    r=np.sqrt((seg**2).mean()) if len(seg) else 0
    dr=[q for q in d['drums'] if t0<=q[0]<t1]
    print('  %-5s %5.1f-%5.1fs  rms %.4f  peak %.2f  鼓%4d'%(name,t0,t1,r,np.abs(seg).max() if len(seg) else 0,len(dr)))
# 音级/和弦贴合：按小节统计每个段落主旋律落和弦音比例
notes=[(n[0],n[1]) for tr in d['tracks'] for n in tr['notes']]
NN=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
TPL={'m':[0,3,7],'':[0,4,7],'m7':[0,3,7,10],'7':[0,4,7,10],'maj7':[0,4,7,11],'dim':[0,3,6],'m7b5':[0,3,6,10]}
lead=[tr for tr in d['tracks'] if abs(tr['gain']-0.13)<1e-6][0]['notes']
print('\n主旋律音数 %d  音域 %d-%d  均值 %.1f'%(len(lead),min(n[1] for n in lead),max(n[1] for n in lead),np.mean([n[1] for n in lead])))
print('\n前 24 音（时间, midi, 音名）')
for n in lead[:24]:
    print('  %6.2fs %s'%(n[0], NN[n[1]%12]+str(n[1]//12-1)), end='')
    if lead.index(n)%4==3: print()
print()
