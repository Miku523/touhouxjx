
import wave, numpy as np
with wave.open('tools/build/pre1_preview.wav','rb') as w:
    n=w.getnframes(); sr=w.getframerate(); x=np.frombuffer(w.readframes(n),dtype='<i2').astype(np.float32)/32768.0
d=52.966
print('len %.2fs peak %.3f rms %.4f' % (len(x)/sr, np.max(np.abs(x)), np.sqrt(np.mean(x**2))))
sec=[float(np.sqrt(np.mean(x[i*sr:(i+1)*sr]**2))) for i in range(int(len(x)/sr))]
print('per-sec rms:', ' '.join('%.3f'%v for v in sec[:20]))
print('seam: rms 0.5s before loop=%0.3f, 0.5s after=%0.3f' % (np.sqrt(np.mean(x[int((d-0.5)*sr):int(d*sr)]**2)), np.sqrt(np.mean(x[int(d*sr):int((d+0.5)*sr)]**2))))
# 频段能量
F=np.abs(np.fft.rfft(x[:int(d*sr)*1])) if False else None
sp=np.abs(np.fft.rfft(x[:int(d*sr)])); fr=np.fft.rfftfreq(int(d*sr),1/sr)
for lo,hi in [(0,120),(120,500),(500,2000),(2000,6000),(6000,16000)]:
    m=(fr>=lo)&(fr<hi); print('band %5d-%5d: %.1f%%' % (lo,hi,100*np.sum(sp[m]**2)/np.sum(sp**2)))
