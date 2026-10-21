# -*- coding: utf-8 -*-
import sys, os, json, numpy as np
sys.path.insert(0, os.path.join(os.getcwd(), 'tools', 'build'))
import _ref5_lib as L
xr, sr = L.load_mono(r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex\tepes_zun.mp3')
OFF = 57.44
def band(ct, f0, dur=0.12):
    a = int(ct*sr); b = a + int(dur*sr)
    if b > len(xr): return 0.0
    seg = xr[a:b] * np.hanning(b-a)
    mag = np.abs(np.fft.rfft(seg, 8192)); f = np.fft.rfftfreq(8192, 1.0/sr)
    w = (f > f0*0.97) & (f < f0*1.03)
    return float(mag[w].max()) if w.any() else 0.0
for t, m in ((32.359, 90), (45.88, 90), (24.12, 71), (26.338, 86), (32.99, 86)):
    ct = OFF + t
    f0 = 440.0*2**((m-69)/12.0)
    row = []
    for d in (-2, -1, 0, 1, 2):
        row.append('%+d:%.0f' % (d, band(ct, 440.0*2**((m+d-69)/12.0))))
    # 参考：中音区平均能量
    print('t=%6.2f m=%d (%.0fHz)  ' % (t, m, f0) + '   '.join(row))
