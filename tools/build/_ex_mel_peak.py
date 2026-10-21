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
def peaks(seg):
    w = np.hanning(len(seg))
    mag = np.abs(np.fft.rfft(seg*w, N))
    f = np.fft.rfftfreq(N, 1.0/sr)
    return f, mag
row = []
for n in lead:
    t, m = n[0], n[1]
    ct = OFF + t
    a = int(ct*sr); b = a + int(0.09*sr)
    if b > len(xr) or m < 60: continue
    f, mag = peaks(xr[a:b])
    band = (f > 500) & (f < 1600)
    if not band.any(): continue
    sub = np.where(band)[0]
    mm = mag[sub]
    # local maxima
    loc = [sub[k] for k in range(1, len(mm)-1) if mm[k] > mm[k-1] and mm[k] >= mm[k+1] and mm[k] > 0.25*mm.max()]
    if not loc: continue
    cand = []
    for k in loc:
        fm = 69 + 12*np.log2(f[k]/440.0)
        cand.append((float(mag[k]), float(fm), float(f[k])))
    cand.sort(reverse=True)
    best = min(cand[:4], key=lambda c: abs(c[1]-m))
    row.append((t, m, best[1], best[2], best[0]/cand[0][0]))
import collections
ok = [r for r in row if abs(r[2]-r[1]) < 0.6]
near = [r for r in row if 0.6 <= abs(r[2]-r[1]) < 1.6]
bad = [r for r in row if abs(r[2]-r[1]) >= 1.6]
print('notes checked', len(row), ' within 0.6st %d  (%.0f%%)' % (len(ok), 100*len(ok)/max(1,len(row))), ' 0.6-1.6st', len(near), ' >1.6st', len(bad))
print('--- worst mismatches ---')
for r in sorted(bad, key=lambda r: -abs(r[2]-r[1]))[:18]:
    print('t=%5.2f  lead %s%d (m=%d)  原曲最近峰 %s%d (%.1fHz) rel=%.2f' % (r[0], PC[int(r[1])%12], int(r[1])//12-1, r[1], PC[int(round(r[2]))%12], int(round(r[2]))//12-1, r[3], r[4]))
print('--- semitone offset histogram ---')
h = collections.Counter(int(round(r[2]-r[1])) for r in row)
for k in sorted(h): print('%+3d : %d' % (k, h[k]))
