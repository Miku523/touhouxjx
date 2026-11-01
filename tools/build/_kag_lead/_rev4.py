# -*- coding: utf-8 -*-
import os, json, io, wave
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
SEC = json.load(io.open(os.path.join(HERE, 'secs.json'), encoding='utf-8'))
if 'secs' in SEC:
    SEC = {k: [a, b] for k, a, b in SEC['secs']}
def rd(p):
    with wave.open(p) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float64) / 32768.0, w.getframerate()
D = os.path.join(HERE, 'stems_v9')
stem = {f[:-4]: rd(os.path.join(D, f)) for f in os.listdir(D) if f.endswith('.wav')}
sr = stem['00_lead'][1]
def band_rms(sig, lo, hi):
    F = np.fft.rfft(sig); fr = np.fft.rfftfreq(len(sig), 1 / sr)
    F[(fr < lo) | (fr >= hi)] = 0
    y = np.fft.irfft(F, len(sig))
    return 20 * np.log10(max(np.sqrt(np.mean(y * y)), 1e-9))
print('=== tick 峰值 / 63-125Hz 能量来源 ===')
for sec in ('C1', 'D1', 'C2', 'D2'):
    a, b = SEC[sec]
    i0, i1 = int(a * sr), int(b * sr)
    tick = stem['12_tick'][0][i0:i1]
    print('%-4s tick peak %.3f  rms %.1f dB' % (sec, float(np.abs(tick).max()), 20 * np.log10(max(np.sqrt(np.mean(tick ** 2)), 1e-9))))
print()
print('%-6s %8s %8s %8s %8s %8s' % ('sec', 'drums', 'bass', 'strings', 'choir', 'master*'))
for sec, (a, b) in SEC.items():
    if sec.startswith('_'):
        continue
    i0, i1 = int(a * sr), int(b * sr)
    vals = []
    for k in ('90_drums', '07_bass', '04_strings', '05_choir'):
        vals.append(band_rms(stem[k][0][i0:i1], 63, 125))
    print('%-6s %8.1f %8.1f %8.1f %8.1f' % (sec, vals[0], vals[1], vals[2], vals[3]))
