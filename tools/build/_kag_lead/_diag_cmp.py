# -*- coding: utf-8 -*-
import os, wave
import numpy as np
KIT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '_kag_kit')
def rd(p):
    with wave.open(p) as w:
        y = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float64) / 32768.0
        return y, w.getframerate(), w.getnchannels()
SEC = [('intro',0.0,6.234),('A1',6.234,26.494),('B',26.494,51.429),('break',51.429,54.545),('C',54.545,79.481),('C1',81.039,91.948),('C2',91.948,104.416),('C3',104.416,116.883),('D1',116.883,129.351),('D2',129.351,141.818),('outro',141.818,155.844),('coda',155.844,162.078)]
for f in ('kaguya_v9_mono.wav', 'kaguya_v10_mono.wav'):
    y, sr, nc = rd(os.path.join(KIT, f))
    print(f, 'peak %.4f' % np.abs(y).max())
    out = []
    for n, a, b in SEC:
        seg = y[int(a*sr):int(b*sr)]
        out.append('%s %.2f' % (n, 20*np.log10(max(np.sqrt(np.mean(seg**2)), 1e-9))))
    print('  ' + ' | '.join(out))
