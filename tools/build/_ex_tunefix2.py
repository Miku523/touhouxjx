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
def energy(ct, midi, t0=0.12, dur=0.18):
    f0 = 440.0 * 2 ** ((midi - 69) / 12.0)
    a = int((ct+t0)*sr); b = a + int(dur*sr)
    if b > len(xr): return 0.0
    seg = xr[a:b] * np.hanning(b - a)
    mag = np.abs(np.fft.rfft(seg, N))
    f = np.fft.rfftfreq(N, 1.0/sr)
    tot = 0.0
    for h in (1, 2, 3):
        fc = f0*h
        if fc > 6000: break
        w = (f > fc*0.975) & (f < fc*1.025)
        if w.any(): tot += mag[w].max() / h
    return tot
print('== 用「音符后半段」（onset+0.12~0.30s）重新仲裁 ==')
out = []
for n in lead:
    t, m, d = n[0], n[1], n[2]
    ct = OFF + t
    base = energy(ct, m)
    cands = [(base, m)]
    for k in (-2, -1, 1, 2):
        cands.append((energy(ct, m+k), m+k))
    cands.sort(reverse=True)
    if cands[0][1] != m and cands[0][0] > cands[0][0]*0 + base*1.25:
        out.append((t, m, cands[0][1], cands[0][0]/max(base, 1e-9), d))
print('需改动 %d / %d' % (len(out), len(lead)))
for t, m, bm, r, d in out:
    print('  t=%6.2f d=%.2f  %s%d -> %s%d  x%.2f' % (t, d, PC[m%12], m//12-1, PC[bm%12], bm//12-1, r))
json.dump([{'t': t, 'from': m, 'to': bm, 'ratio': round(r,3)} for t,m,bm,r,d in out],
          open('tools/build/_ex_lead_fix2.json','w'), ensure_ascii=False, indent=1)
