# -*- coding: utf-8 -*-
import os, json, io, wave
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
SEC = json.load(io.open(os.path.join(HERE, 'secs.json'), encoding='utf-8'))
if 'secs' in SEC:
    SEC = {k: [a, b] for k, a, b in SEC['secs']}
def rd(p):
    with wave.open(p) as w:
        n = w.getnframes(); sr = w.getframerate()
        return np.frombuffer(w.readframes(n), dtype='<i2').astype(np.float64) / 32768.0, sr
D = os.path.join(HERE, 'stems_v9')
stems = {}
for f in sorted(os.listdir(D)):
    if f.endswith('.wav'):
        d, sr = rd(os.path.join(D, f))
        stems[f[:-4]] = d
def rms(x):
    return 20 * np.log10(max(np.sqrt(np.mean(x * x)), 1e-9))
keys = ['00_lead', '06_brass', '09_bell', '01_piano', '02_harpsi', '03_arp', '04_strings', '05_choir', '07_bass', '10_pad', '11_counter', '12_tick', '90_drums']
print('%-8s' % 'sec' + ''.join('%9s' % k.split('_', 1)[1][:7] for k in keys))
meld = {'intro': 'bell', 'A1': 'lead', 'B': 'brass', 'break': 'piano', 'C': 'lead', 'riser': 'lead',
        'C1': 'lead', 'C2': 'lead', 'C3': 'lead', 'D1': 'lead', 'D2': 'lead', 'outro': 'lead', 'coda': 'bell'}
print()
bal = []
for sec, (a, b) in SEC.items():
    if sec.startswith('_'):
        continue
    i0, i1 = int(a * sr), int(b * sr)
    row = '%-8s' % sec
    for k in keys:
        d = stems.get(k)
        row += '%9.1f' % (rms(d[i0:i1]) if d is not None else -999)
    print(row)
    m = stems['00_lead' if meld[sec] == 'lead' else ('06_brass' if meld[sec] == 'brass' else '09_bell')]
    bal.append((sec, rms(m[i0:i1]), rms(stems['90_drums'][i0:i1])))
print()
print('=== 主奏 vs 鼓（stem 口径）===')
for sec, m, d in bal:
    print('%-8s melody %7.1f  drums %7.1f  diff %+6.1f' % (sec, m, d, m - d))
