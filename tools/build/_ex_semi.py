# -*- coding: utf-8 -*-
import sys, os, json, numpy as np
sys.path.insert(0, os.path.join(os.getcwd(), 'tools', 'build'))
import _ref5_lib as L
PC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
xr, sr = L.load_mono(r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex\tepes_zun.mp3')
lead = json.load(open('tools/build/_ex_lead.json', encoding='utf-8'))
if isinstance(lead, dict): lead = lead.get('notes', lead.get('lead'))
OFF = 57.44
def band(ct, m, dur=0.12):
    f0 = 440.0*2**((m-69)/12.0)
    a = int(ct*sr); b = a + int(dur*sr)
    if b > len(xr): return 0.0
    seg = xr[a:b]*np.hanning(b-a)
    mag = np.abs(np.fft.rfft(seg, 8192)); f = np.fft.rfftfreq(8192, 1.0/sr)
    w = (f > f0*0.975) & (f < f0*1.03)
    return float(mag[w].max()) if w.any() else 0.0
bad = []
for n in lead:
    t, m = n[0], n[1]
    ct = OFF + t
    e0 = band(ct, m)
    cands = [(band(ct, m+d), m+d) for d in (-1, 1)]
    best = max(cands)
    if best[0] > e0 * 1.5:
        bad.append((t, m, best[1], best[0]/max(e0, 1e-9)))
print('半音级可疑音 %d / %d' % (len(bad), len(lead)))
for t, m, bm, r in bad:
    print('  t=%6.2f  %s%d -> %s%d  比 %.1f' % (t, PC[m%12], m//12-1, PC[bm%12], bm//12-1, r))
