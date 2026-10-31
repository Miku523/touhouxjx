import os, sys, json, wave
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
SEC = json.load(open(os.path.join(HERE,'secs.json'),encoding='utf-8'))
STEMS = os.path.join(HERE, os.environ.get('STEMS','stems1'))
SR = 22050

def read(path):
    with wave.open(path,'rb') as w:
        n = w.getnframes()
        a = np.frombuffer(w.readframes(n), dtype='<i2').astype(np.float64)/32768.0
    return a

files = sorted(f for f in os.listdir(STEMS) if f.endswith('.wav')) if os.path.isdir(STEMS) else []
data = {f[:-4]: read(os.path.join(STEMS,f)) for f in files}
print('[stems]', len(data))

def rms_db(x):
    if len(x)==0: return -120.0
    m = float(np.mean(x*x))
    return 10*np.log10(max(m,1e-20))

names = list(SEC.keys())
for n in names:
    if n.startswith('_'): continue
    a,b = SEC[n]
    s = int(a*SR); e = int(b*SR)
    print('--- ' + n)
    rows=[]
    for k,x in data.items():
        if k.startswith('90_'): continue
        rows.append((rms_db(x[s:e]), k))
    rows.sort(reverse=True)
    tot = 10*np.log10(max(sum(10**(r/10) for r,_ in rows),1e-20))
    print('   ' + '  '.join('%s %.1f' % (k,v) for v,k in rows if v>-60))
    if any(k.startswith('90_') for k in data):
        dk = [k for k in data if k.startswith('90_')][0]
        print('   drums %.1f' % rms_db(data[dk][s:e]))
