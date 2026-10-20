# -*- coding: utf-8 -*-
import soundfile as sf, numpy as np, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ref5_inst.mp3'
d, sr = sf.read(p, always_2d=True); x = d.mean(1).astype(np.float32)
bpm = 128.3; beat = 60.0/bpm; bar = 4*beat
# 低频包络
from numpy.fft import rfft, irfft
X = rfft(x); f = np.fft.rfftfreq(len(x), 1/sr)
X2 = X.copy(); X2[(f<40)|(f>110)] = 0
low = irfft(X2, len(x))
env = np.convolve(np.abs(low), np.ones(128)/128, 'same')
# 找峰值
peaks=[]
i=1
while i < len(env)-1:
    if env[i] > env[i-1] and env[i] >= env[i+1] and env[i] > env.mean()*1.6:
        if not peaks or i-peaks[-1] > 0.12*sr: peaks.append(i)
    i+=1
ts = np.array(peaks)/sr
ts = ts[(ts>20)&(ts<230)]
# 相位（按小节）
phase = np.mod(ts, bar)
h, edges = np.histogram(phase, bins=32, range=(0,bar))
print('底鼓相位分布（16 分格，%d 小节）' % int(len(ts)/4))
for k in range(32):
    beat_pos = k*bar/32/beat
    print('  %5.2f 拍  %s' % (beat_pos, '#'*int(h[k]/max(1,h.max())*40)))
# 中频（军鼓 200-1000）峰值相位
X3 = X.copy(); X3[(f<200)|(f>1200)] = 0
mid = irfft(X3, len(x)); envm = np.convolve(np.abs(mid), np.ones(128)/128, 'same')
pk=[]
i=1
while i < len(envm)-1:
    if envm[i]>envm[i-1] and envm[i]>=envm[i+1] and envm[i]>envm.mean()*1.8:
        if not pk or i-pk[-1] > 0.1*sr: pk.append(i)
    i+=1
tm = np.array(pk)/sr; tm = tm[(tm>20)&(tm<230)]
pm = np.mod(tm, bar)
h2,_ = np.histogram(pm, bins=32, range=(0,bar))
print('中频（军鼓/吉他）相位分布:')
for k in range(32):
    print('  %5.2f 拍  %s' % (k*bar/32/beat, '#'*int(h2[k]/max(1,h2.max())*40)))
