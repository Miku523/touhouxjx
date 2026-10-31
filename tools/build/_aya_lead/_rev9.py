
import json, os, glob, numpy as np, soundfile as sf
root = r"C:\Users\GuSheng\Downloads\HKS"
HERE = os.path.join(root,'tools/build/_aya_lead')
sec = json.load(open(os.path.join(HERE,'secs.json'), encoding='utf-8'))
def db(v): return 20*np.log10(max(v,1e-12))
x, sr = sf.read(os.path.join(root,'tools/build/_aya_kit/aya_v3c_mono.wav'), dtype='float64')
if x.ndim>1: x = x.mean(axis=1)
print('whole RMS %.2f peak %.3f' % (db(np.sqrt(np.mean(x*x))), np.abs(x).max()))
for nm,a,b in sec['secs']:
    s,e = int(a*sr), min(int(b*sr), len(x)); seg=x[s:e]
    print('%-8s %6.2f  RMS %6.2f' % (nm, a, db(np.sqrt(np.mean(seg*seg)))))
