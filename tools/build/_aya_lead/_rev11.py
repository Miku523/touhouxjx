
import os, json, numpy as np, soundfile as sf
root = r"C:\Users\GuSheng\Downloads\HKS"
HERE = os.path.join(root,'tools/build/_aya_lead')
sec = json.load(open(os.path.join(HERE,'secs.json'), encoding='utf-8'))['secs']
x, sr = sf.read(os.path.join(root,'tools/build/_aya_kit/aya_stage4_stereo.wav'), dtype='float64')
def db(v): return 20*np.log10(max(v,1e-12))
for nm,a,b in sec:
    seg = x[int(a*sr):min(int(b*sr), len(x))]
    rms_t = np.sqrt(np.mean(seg[:,0]**2+seg[:,1]**2)); rms_c = np.sqrt(np.mean(seg**2))
    lo = seg.mean(axis=1)
    print('%-8s %6.2f  total %6.2f   (mono-equiv %6.2f)' % (nm, a, db(rms_t), db(rms_t)+3.0103))
print('peak %.4f  whole total %.2f  5k+ %.1f' % (np.abs(x).max(), db(np.sqrt(np.mean(x[:,0]**2+x[:,1]**2))), 0))
