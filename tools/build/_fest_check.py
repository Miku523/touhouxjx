import sys, wave, numpy as np
p=sys.argv[1]
w=wave.open(p,'rb'); n=w.getnframes(); sr=w.getframerate()
x=np.frombuffer(w.readframes(n),dtype='<i2').astype(np.float32)/32768.0
if w.getnchannels()>1: x=x.reshape(-1,w.getnchannels()).mean(1)
print('dur %.2fs sr %d peak %.3f rms %.1f dB clip %d'%(len(x)/sr,sr,np.abs(x).max(),20*np.log10(np.sqrt((x**2).mean())+1e-12),int((np.abs(x)>0.999).sum())))
seg=int(8*sr)
print('time  rmsdB  cent  <200  200-2k  >2k')
for i in range(0,len(x),seg):
    b=x[i:i+seg]
    if len(b)<sr: break
    sp=np.abs(np.fft.rfft(b*np.hanning(len(b)))); fr=np.fft.rfftfreq(len(b),1/sr)
    e=sp**2; tot=e.sum()+1e-12
    c=(fr*e).sum()/tot
    lo=e[fr<200].sum()/tot; mid=e[(fr>=200)&(fr<2000)].sum()/tot; hi=e[fr>=2000].sum()/tot
    print('%5.1f  %6.1f %5.0f %5.0f%% %5.0f%% %5.0f%%'%(i/sr,20*np.log10(np.sqrt((b**2).mean())+1e-12),c,lo*100,mid*100,hi*100))
