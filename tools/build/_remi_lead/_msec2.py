import json, os, sys
import numpy as np, soundfile as sf
HERE = os.path.dirname(os.path.abspath(__file__))
secs = json.load(open(os.path.join(HERE,'secs.json'),encoding='utf-8'))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE,'..','_remi_kit','remilia_septette.wav')
y, sr = sf.read(path)
if y.ndim > 1: y = y.mean(axis=1)
print(path, y.shape, sr, round(len(y)/sr,3))
def rms(a): return 10*np.log10(max(float(np.mean(a*a)),1e-20))
def band(x, lo, hi):
    X = np.fft.rfft(x*np.hanning(len(x))); f = np.fft.rfftfreq(len(x), 1.0/sr)
    p = np.abs(X)**2; m = (f>=lo)&(f<hi)
    return 10*np.log10(max(float(np.sum(p[m])),1e-20)/max(float(np.sum(p)),1e-20))
for k,v in secs.items():
    if k.startswith('_'): continue
    a,b = v; s=int(a*sr); e=int(b*sr); seg=y[s:e]
    if len(seg) < 100: continue
    print('%-8s %6.1f-%6.1f  RMS %6.2f  low %6.1f  mid %6.1f  hi %6.1f' % (k,a,b,rms(seg),band(seg,40,250),band(seg,300,3000),band(seg,4000,12000)))
print('whole RMS %.2f  crest %.2f  peak %.3f' % (rms(y), 20*np.log10(np.max(np.abs(y))/np.sqrt(np.mean(y*y))), np.max(np.abs(y))))
