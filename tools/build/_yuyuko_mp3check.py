import numpy as np, soundfile as sf
def rd(p):
    x,sr=sf.read(p, frames=-1, always_2d=True)
    return np.asarray(x,dtype=float), sr
WAV='tools/build/_yuyuko_kit/yuyuko_stage5_stereo.wav'
MP3='src/assets/bgm/yuyuko_stage5.mp3'
w,sr=rd(WAV); m,sr2=rd(MP3)
def seam(x): return float(np.max(np.abs(x[0]-x[-1]))), float(np.mean(np.abs(np.diff(x[-2000:],axis=0))))
sw=seam(w); sm=seam(m)
n=min(len(w),len(m)); best=None
for lag in range(0,1200):
    a=w[:n-lag].ravel(); b=m[lag:lag+len(a)].ravel()
    e=float(np.sqrt(np.mean((a-b)**2)))
    if best is None or e<best[1]: best=(lag,e)
lag,e=best
snr=10*np.log10((float(np.mean(w[:n-lag].ravel()**2))+1e-20)/(e*e+1e-20))
o=[f'wav samples={len(w)} dur={len(w)/sr:.3f}', f'mp3 samples={len(m)} dur={len(m)/sr2:.3f}',
   f'wav seam={sw[0]:.6f} slope={sw[1]:.6f}', f'mp3 seam={sm[0]:.6f} slope={sm[1]:.6f}',
   f'seam ratio mp3/wav={sm[0]/max(sw[0],1e-9):.3f}', f'lag={lag} SNR={snr:.2f} dB']
open('tools/build/_yuyuko_kit/mp3_check.txt','w',encoding='utf-8').write('\n'.join(o))
print('done')