
import json, os, glob, numpy as np, soundfile as sf
root = r"C:\Users\GuSheng\Downloads\HKS"
HERE = os.path.join(root,'tools/build/_aya_lead')
sec = json.load(open(os.path.join(HERE,'secs.json'), encoding='utf-8'))
S = {n:(a,b) for n,a,b in sec['secs']}
def db(v): return 20*np.log10(max(v,1e-12))
def band_rms(x, sr, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1/sr)
    X[(f<lo)|(f>hi)] = 0
    y = np.fft.irfft(X, len(x)); return np.sqrt(np.mean(y*y))
# peaks of sfx
for p in ('13_knife.wav','14_riser.wav','15_reverse.wav','00_lead.wav','10_bell.wav'):
    x,sr = sf.read(os.path.join(HERE,'stems_v3',p), dtype='float64')
    print('%-16s peak %6.1f' % (p, db(np.abs(x).max())))
print()
# mid band lead vs drums
for p in ('00_lead.wav','90_drums.wav','01_brass.wav','10_bell.wav'):
    x,sr = sf.read(os.path.join(HERE,'stems_v3',p), dtype='float64')
    row=[]
    for nm in ('a2','b','c1','c2','a2b','c2b'):
        a,b = S[nm]; s,e = int(a*sr), int(b*sr)
        row.append(db(band_rms(x[s:e], sr, 500, 3000)))
    print('%-16s' % p + ''.join('%8.1f' % v for v in row), '  (a2 b c1 c2 a2b c2b)')
