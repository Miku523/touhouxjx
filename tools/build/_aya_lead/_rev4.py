
import json, os, glob, numpy as np, soundfile as sf
root = r"C:\Users\GuSheng\Downloads\HKS"
HERE = os.path.join(root,'tools/build/_aya_lead')
sec = json.load(open(os.path.join(HERE,'secs.json'), encoding='utf-8'))
def db(v): return 20*np.log10(max(v,1e-12))
def band_rms(x, sr, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1/sr)
    X[(f<lo)|(f>hi)] = 0
    y = np.fft.irfft(X, len(x))
    return np.sqrt(np.mean(y*y))
targets = ['00_lead.wav','01_brass.wav','03_arp.wav','06_strings.wav','10_bell.wav','12_wavesquare.wav','90_drums.wav','08_bass.wav']
secs_use = ['a2','b','c1','c2','c1b','c2b','e_break','e_coda']
print('band 500-3000Hz RMS per section')
print('%-18s' % 'track' + ''.join('%8s' % s for s in secs_use))
for p in targets:
    x,sr = sf.read(os.path.join(HERE,'stems_v4',p), dtype='float64')
    if x.ndim>1: x=x.mean(axis=1)
    row=[]
    for nm,a,b in sec['secs']:
        if nm not in secs_use: continue
        s,e = int(a*sr), min(int(b*sr), len(x))
        row.append(db(band_rms(x[s:e], sr, 500, 3000)))
    print('%-18s' % p[:18] + ''.join('%8.1f' % v for v in row))
