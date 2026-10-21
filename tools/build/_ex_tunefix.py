# -*- coding: utf-8 -*-
import sys, os, json, numpy as np
sys.path.insert(0, os.path.join(os.getcwd(), 'tools', 'build'))
import _ref5_lib as L
PC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
xr, sr = L.load_mono(r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex\tepes_zun.mp3')
lead = json.load(open('tools/build/_ex_lead.json', encoding='utf-8'))
if isinstance(lead, dict): lead = lead.get('notes', lead.get('lead'))
OFF = 57.44
N = 8192
def energy(ct, midi):
    f0 = 440.0 * 2 ** ((midi - 69) / 12.0)
    a = int(ct*sr); b = a + int(0.10*sr)
    if b > len(xr): return 0.0
    seg = xr[a:b] * np.hanning(b - a)
    mag = np.abs(np.fft.rfft(seg, N))
    f = np.fft.rfftfreq(N, 1.0/sr)
    tot = 0.0
    for h in (1, 2, 3):
        fc = f0*h
        if fc > 6000: break
        w = (f > fc*0.972) & (f < fc*1.028)
        if w.any(): tot += mag[w].max() / h
    return tot
fixes = []
for n in lead:
    t, m = n[0], n[1]
    ct = OFF + t
    base = energy(ct, m)
    best, bm = base, m
    for d in (-2, -1, 1, 2):
        e = energy(ct, m+d)
        if e > best * 1.25:
            best, bm = e, m + d
    if bm != m:
        fixes.append((t, m, bm, best/max(base, 1e-9)))
print('需要校准的主旋律音 %d / %d' % (len(fixes), len(lead)))
for t, m, bm, r in fixes:
    print('  t=%6.2f  %s%d (m=%3d) -> %s%d (m=%3d)  能量比 %.2f' % (t, PC[m%12], m//12-1, m, PC[bm%12], bm//12-1, bm, r))
json.dump([{'t': t, 'from': m, 'to': bm, 'ratio': round(r, 3)} for t, m, bm, r in fixes],
          open('tools/build/_ex_lead_fix.json', 'w'), ensure_ascii=False, indent=1)
