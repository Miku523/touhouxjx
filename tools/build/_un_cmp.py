# -*- coding: utf-8 -*-
import sys
import numpy as np, soundfile as sf
sys.stdout.reconfigure(encoding='utf-8',errors='replace')
def load(p):
    x,sr=sf.read(p,always_2d=True)
    return x.mean(axis=1), sr
a,sr=load('tools/build/old_extra.wav'); b,_=load('tools/build/un_fuse.wav')
BAR=240.0/155; secs=[('riff',0,10),('theme',10,20),('runs',20,34),('静默',34,38),('重建',38,46),('theme2',46,64),('climax',64,77),('尾',77,79)]
print('段落      原曲rms  融合rms   +dB   原曲峰值 融合峰值')
for name,b0,b1 in secs:
    s0,s1=int(b0*BAR*sr),int(min(b1*BAR,len(a)+1)*sr)
    xa,xb=a[s0:s1],b[s0:s1]
    ra,rb=np.sqrt((xa**2).mean()+1e-12),np.sqrt((xb**2).mean()+1e-12)
    print('%-8s %.4f   %.4f   %+5.1f  %.3f   %.3f'%(name,ra,rb,20*np.log10(rb/ra),np.abs(xa).max(),np.abs(xb).max()))
print('\n全曲 peak %.3f / %.3f   rms %.4f / %.4f'%(np.abs(a).max(),np.abs(b).max(),np.sqrt((a**2).mean()),np.sqrt((b**2).mean())))
