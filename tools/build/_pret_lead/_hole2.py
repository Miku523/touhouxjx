# -*- coding: utf-8 -*-
import os, wave, numpy as np, time
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
for n, t0, t1 in (('pre2', 6.8, 8.1), ('pre3', 4.3, 5.9)):
    p = os.path.join(ROOT, 'tools/build/_pret_kit/%s_stereo.wav' % n)
    st = os.stat(p)
    with wave.open(p) as w:
        sr = w.getframerate(); nf = w.getnframes()
        a = int(t0 * sr); b = int(t1 * sr)
        w.setpos(a)
        x = np.frombuffer(w.readframes(b - a), dtype='<i2').astype(np.float64).reshape(-1, 2).mean(axis=1) / 32768.0
    print(n, 'bytes', st.st_size, 'mtime', time.strftime('%H:%M:%S', time.localtime(st.st_mtime)), 'hole rms dB', round(20*np.log10(max(np.sqrt(np.mean(x*x)),1e-9)),2), 'frames', nf, 'dur', round(nf/sr,3))
    print('   first 10 samples', np.round(x[:10],4))
