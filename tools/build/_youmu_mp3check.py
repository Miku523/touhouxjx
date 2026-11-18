import numpy as np, soundfile as sf
def rd(p):
    x,sr=sf.read(p, frames=-1, always_2d=True)
    return np.asarray(x,dtype=float), sr
w,sr=rd('src/assets/bgm/youmu_pre5.mp3'.replace('.mp3','.wav')) if False else (None,None)
WAV='tools/build/_youmu_kit/youmu_pre5_stereo.wav'
MP3='src/assets/bgm/youmu_pre5.mp3'
w,sr=rd(WAV); m,sr2=rd(MP3)
def seam(x):
    return float(np.max(np.abs(x[0]-x[-1]))), float(np.mean(np.abs(np.diff(x[-2000:],axis=0))))
sw=seam(w); sm=seam(m)
n=min(len(w),len(m))
best=None
for lag in range(0,1200):
    a=w[:n-lag].ravel(); b=m[lag:lag+len(a)].ravel()
    e=float(np.sqrt(np.mean((a-b)**2)))
    if best is None or e<best[1]: best=(lag,e)
lag,e=best
snr=10*np.log10((float(np.mean(w[:n-lag].ravel()**2))+1e-20)/(e*e+1e-20))
out=[]
out.append(f'wav samples={len(w)} dur={len(w)/sr:.3f}s sr={sr}')
out.append(f'mp3 samples={len(m)} dur={len(m)/sr2:.3f}s sr={sr2}')
out.append(f'wav seam jump={sw[0]:.6f} mean|diff| last2k={sw[1]:.6f}')
out.append(f'mp3 seam jump={sm[0]:.6f} mean|diff| last2k={sm[1]:.6f}')
out.append(f'seam ratio mp3/wav = {sm[0]/max(sw[0],1e-9):.3f} (need <=1.5)')
out.append(f'align lag={lag} SNR={snr:.2f} dB (need >=12)')
open('tools/build/_youmu_kit/mp3_check.txt','w',encoding='utf-8').write('\n'.join(out))
print('done')