import numpy as np, soundfile as sf, hashlib, os
p='src/assets/bgm/flandre_devil.wav'
x,sr=sf.read(p, always_2d=True, dtype='float32'); x=x.mean(axis=1)
print('wav', os.path.getsize(p),'B', len(x),'samples', round(len(x)/sr,4),'s', sr,'Hz')
print('peak', round(float(np.abs(x).max()),5), 'rms', round(float(20*np.log10(np.sqrt((x**2).mean()))),4), 'clips', int((np.abs(x)>0.999).sum()))
print('seam', round(float(abs(x[0]-x[-1])),6))
d=np.abs(np.diff(x)); print('seam pct', round(float((d<abs(x[0]-x[-1])).mean()*100),2))
h=hashlib.sha256(open(p,'rb').read()).hexdigest(); print('sha', h[:32])
mp3='src/assets/bgm/flandre_devil.mp3'
print('mp3', os.path.getsize(mp3),'B', 'sha', hashlib.sha256(open(mp3,'rb').read()).hexdigest()[:32])
