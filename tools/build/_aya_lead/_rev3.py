
import json, os, glob, numpy as np, soundfile as sf
root = r"C:\Users\GuSheng\Downloads\HKS"
HERE = os.path.join(root,'tools/build/_aya_lead')
sec = json.load(open(os.path.join(HERE,'secs.json'), encoding='utf-8'))
def db(v): return 20*np.log10(max(v,1e-12))
stems = sorted(glob.glob(os.path.join(HERE,'stems_v4','*.wav')))
print('%-20s %8s %8s %8s %8s' % ('track','peak','rms','rmsActive','active%'))
for p in stems:
    x,sr = sf.read(p, dtype='float64')
    if x.ndim>1: x=x.mean(axis=1)
    pk = np.abs(x).max(); rms = np.sqrt(np.mean(x*x))
    env = np.abs(x)
    # active = frames above -50dBFS in 50ms windows
    w = int(0.05*sr)
    n = len(x)//w
    fr = np.sqrt((x[:n*w].reshape(n,w)**2).mean(axis=1))
    act = fr > 0.00316  # -50 dB
    ra = np.sqrt((fr[act]**2).mean()) if act.any() else 0
    print('%-20s %8.1f %8.1f %8.1f %7.1f%%' % (os.path.basename(p)[:20], db(pk), db(rms), db(ra), 100*act.mean()))
