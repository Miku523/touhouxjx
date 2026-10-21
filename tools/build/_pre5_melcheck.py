# -*- coding: utf-8 -*-
import sys, os
R = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(R, 'tools', 'build')); sys.path.insert(0, os.path.join(R, 'tools'))
import numpy as np, _ref5_lib as RL, midi2js as M
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
REF = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\pre5\refA.mp3'
MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '7 - Perfect Cherry Blossom', '11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid')
x, sr = RL.load_mono(REF)
ch, segs, div = M.extract_channels(M.parse_midi(MID))
print('midi bpm', M.bpm_of(segs))

def pch(notes, t0, t1, w=2.0):
    v = np.zeros(12)
    for n in notes:
        t = n['t']
        if t0 <= t < t1:
            v[int(n['m']) % 12] += n['d']
    return v / (v.sum() + 1e-9)

def ref_pch(t0, t1):
    seg = x[int(t0*sr):int(t1*sr)]
    X = np.abs(np.fft.rfft(seg*np.hanning(len(seg))))**2
    f = np.fft.rfftfreq(len(seg), 1.0/sr)
    v = np.zeros(12)
    for m in range(24, 100):
        f0 = 440.0 * 2**((m-69)/12.0)
        band = (f >= f0*0.985) & (f < f0*1.015)
        if band.any():
            v[m % 12] += X[band].sum()
    return v / (v.sum() + 1e-9)

names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def show(v): return ' '.join('%s%2d' % (names[i], round(v[i]*100)) for i in range(12) if v[i] > 0.02)
for t0 in (1.55, 8, 20, 32.5, 55, 80, 95):
    a = pch(ch[0]['notes'], t0, t0+4)
    b = ref_pch(t0, t0+4)
    print('MIDI %5.1fs  ch0: %s' % (t0, show(a)))
    print('refA %5.1fs 全轨: %s' % (t0, show(b)))
    print()
