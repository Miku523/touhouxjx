import json, wave, numpy as np, os
ROOT = r'C:/Users/GuSheng/Downloads/HKS'
p = ROOT + '/tools/build/_cirno_kit/cirno_stage3_stereo.wav'
w = wave.open(p); sr = w.getframerate(); n = w.getnframes(); nch = w.getnchannels()
x = np.frombuffer(w.readframes(n), dtype='<i2').astype(np.float64).reshape(-1, nch) / 32768.0
tot = np.sqrt(np.mean((x**2).sum(axis=1)))
print('whole total dB', round(20*np.log10(tot), 2), 'per-ch dB', round(20*np.log10(np.sqrt(np.mean(x**2))), 2), 'peak', round(float(np.abs(x).max()), 4))
secs = json.load(open(ROOT + '/tools/build/_cirno_lead/secs.json', encoding='utf-8'))['secs']
for name, a, b in secs:
    seg = x[int(a*sr):int(b*sr)]
    r = np.sqrt(np.mean((seg**2).sum(axis=1)))
    m = np.sqrt(np.mean(seg**2))
    print('%-9s %7.3f  mono-equivalent %7.3f' % (name, 20*np.log10(m), 20*np.log10(r)))