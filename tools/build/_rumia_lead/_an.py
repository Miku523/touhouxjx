import os, sys, glob
import numpy as np, soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
STEMS = os.path.join(HERE, sys.argv[1] if len(sys.argv) > 1 else 'stems2')
MASTER = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, '..', '_rumia_kit', 'youma2.wav')
SEC = [('intro', 0.0, 11.0), ('orig', 11.0, 64.8), ('bridge', 64.8, 74.8), ('var', 74.8, 102.2), ('coda', 102.2, 113.0)]
SR = 22050
def db(x): return 20*np.log10(max(1e-9, x))
rows = []
for f in sorted(glob.glob(os.path.join(STEMS, '*.wav'))):
    y, sr = sf.read(f, dtype='float64')
    if y.ndim > 1: y = y.mean(axis=1)
    r = [db(np.sqrt(np.mean(y**2)))]
    for (nm, a, b) in SEC:
        seg = y[int(a*SR):int(b*SR)]
        r.append(db(np.sqrt(np.mean(seg**2))) if len(seg) else -120)
    rows.append((os.path.basename(f)[:-4], r))
print('%-16s %7s' % ('stem','whole') + ''.join('%9s' % s[0] for s in SEC))
for n, r in rows:
    print('%-16s %7.2f' % (n, r[0]) + ''.join('%9.2f' % x for x in r[1:]))
m, sr = sf.read(MASTER, dtype='float64')
if m.ndim > 1: m = m.mean(axis=1)
print('\nmaster whole %.2f peak %.4f' % (db(np.sqrt(np.mean(m**2))), np.max(np.abs(m))))
for (nm,a,b) in SEC:
    seg = m[int(a*SR):int(b*SR)]
    print('  %-7s %.2f' % (nm, db(np.sqrt(np.mean(seg**2)))))
