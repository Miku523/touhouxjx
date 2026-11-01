# -*- coding: utf-8 -*-
"""tools/build/_pret_lead/_mix1.py —— 五首道中曲 v1 混音修正（增益/力度）"""
import os, io
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
B = os.path.join(ROOT, 'tools', 'build')

def edit(fn, pairs):
    p = os.path.join(B, fn)
    s = io.open(p, encoding='utf-8').read()
    for old, new, cnt in pairs:
        c = s.count(old)
        assert c == cnt, (fn, old[:60], c, cnt)
        s = s.replace(old, new)
    io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
    print('patched', fn)

# ---- pre1
edit('_pret1_compose.py', [
    ("('lead',    'triangle', 0.310)", "('lead',    'triangle', 0.285)", 1),
    ("('bell',    'sine',     0.170)", "('bell',    'sine',     0.135)", 1),
    ("('bass',    'triangle', 0.150)", "('bass',    'triangle', 0.165)", 1),
    ("('harpsi',  'square',   0.165)", "('harpsi',  'square',   0.180)", 1),
    ("('piano',   'triangle', 0.088)", "('piano',   'triangle', 0.095)", 1),
    ("('strings', 'sawtooth', 0.185)", "('strings', 'sawtooth', 0.195)", 1),
    ("('pad',     'sine',     0.120)", "('pad',     'sine',     0.135)", 1),
    ("'C': 1.03,", "'C': 0.96,", 1),
    ("eng.doubles([('bell', 12, 0.42, 0.85, 100)], 15, 54)", "eng.doubles([('bell', 12, 0.32, 0.85, 100)], 15, 54)", 1),
    ("s.add('lead', t, n['m'], n['d'], n['v'] * 0.58)", "s.add('lead', t, n['m'], n['d'], n['v'] * 0.48)", 1),
    ("s.add('bell', t, n['m'] + 12, max(0.10, n['d'] * 0.9), n['v'] * 0.30)", "s.add('bell', t, n['m'] + 12, max(0.10, n['d'] * 0.9), n['v'] * 0.22)", 1),
    ("s.drum(s.bt(b, i * 0.25), 2, 66 if i % 4 else 84)", "s.drum(s.bt(b, i * 0.25), 2, 96 if i % 4 else 116)", 1),
    ("s.drum(s.bt(b, i * 0.25), 2, 74 if i % 4 else 92)", "s.drum(s.bt(b, i * 0.25), 2, 104 if i % 4 else 120)", 1),
    ("s.drum(s.bt(b, i * 0.25), 2, 76 if i % 4 else 94)", "s.drum(s.bt(b, i * 0.25), 2, 104 if i % 4 else 122)", 1),
    ("s.drum(s.bt(b, i), 7, 66)", "s.drum(s.bt(b, i), 7, 96)", 1),
    ("s.drum(s.bt(b, i), 7, 68)", "s.drum(s.bt(b, i), 7, 98)", 1),
    ("s.drum(s.bt(b, i), 7, 70)", "s.drum(s.bt(b, i), 7, 100)", 1),
    ("s.drum(s.bt(b, i), 7, 74)", "s.drum(s.bt(b, i), 7, 104)", 1),
    ("s.drum(s.bt(b, 1.5), 3, 78)", "s.drum(s.bt(b, 1.5), 3, 104)", 1),
    ("s.drum(s.bt(b, 3.5), 3, 82)", "s.drum(s.bt(b, 3.5), 3, 108)", 1),
    ("s.drum(s.bt(b, 1.5), 3, 88)", "s.drum(s.bt(b, 1.5), 3, 112)", 1),
    ("s.drum(s.bt(b, 3.5), 3, 92)", "s.drum(s.bt(b, 3.5), 3, 116)", 1),
    ("s.drum(s.bt(b, 1.5), 3, 90)", "s.drum(s.bt(b, 1.5), 3, 114)", 1),
    ("s.drum(s.bt(b, 3.5), 3, 94)", "s.drum(s.bt(b, 3.5), 3, 118)", 1),
    ("s.drum(s.bt(b, 1.5), 3, 92)", "s.drum(s.bt(b, 1.5), 3, 114)", 1),
    ("s.drum(s.bt(b, 3.5), 3, 96)", "s.drum(s.bt(b, 3.5), 3, 120)", 1),
])

# ---- pre2
edit('_pret2_compose.py', [
    ("('harpsi',  'square',   0.330)", "('harpsi',  'square',   0.400)", 1),
    ("('strings', 'sawtooth', 0.240)", "('strings', 'sawtooth', 0.280)", 1),
    ("('bell',    'sine',     0.108)", "('bell',    'sine',     0.125)", 1),
    ("('choir',   'sine',     0.200)", "('choir',   'sine',     0.165)", 1),
    ("('piano',   'triangle', 0.240)", "('piano',   'triangle', 0.245)", 1),
])

# ---- pre3
edit('_pret3_compose.py', [
    ("('lead',    'square',   0.300)", "('lead',    'square',   0.245)", 1),
    ("('piano',   'triangle', 0.115)", "('piano',   'triangle', 0.145)", 1),
    ("('harpsi',  'square',   0.150)", "('harpsi',  'square',   0.190)", 1),
    ("('strings', 'sawtooth', 0.150)", "('strings', 'sawtooth', 0.190)", 1),
    ("('choir',   'sine',     0.110)", "('choir',   'sine',     0.135)", 1),
    ("('bass',    'triangle', 0.120)", "('bass',    'triangle', 0.150)", 1),
    ("('bell',    'sine',     0.140)", "('bell',    'sine',     0.130)", 1),
])

# ---- pre4
edit('_pret4_compose.py', [
    ("3:  [('lead', 0, 0.85, 1.0), ('bell', 12, 0.22, 0.9)]", "3:  [('lead', 0, 0.55, 1.0), ('bell', 12, 0.18, 0.9)]", 1),
    ("12: [('lead', 0, 0.80, 1.0)]", "12: [('lead', 0, 0.50, 1.0)]", 1),
    ("4:  [('lead', 0, 0.52, 1.0), ('brass', 0, 0.50, 1.0)]", "4:  [('lead', 0, 0.34, 1.0), ('brass', 0, 0.44, 1.0)]", 1),
    ("dyn={'A1': 0.96, 'A2': 1.02, 'B': 0.98, 'C1': 1.05, 'C2': 1.06, 'D': 1.10}",
     "dyn={'A1': 0.94, 'A2': 0.96, 'B': 0.96, 'C1': 1.00, 'C2': 1.00, 'D': 1.03}", 1),
    ("('lead',    'triangle', 0.300)", "('lead',    'triangle', 0.270)", 1),
])

# ---- pre6
edit('_pret6_compose.py', [
    ("('piano',   'triangle', 0.125)", "('piano',   'triangle', 0.085)", 1),
    ("('lead',    'square',   0.300)", "('lead',    'square',   0.330)", 1),
    ("('harpsi',  'square',   0.140)", "('harpsi',  'square',   0.170)", 1),
    ("('bell',    'sine',     0.130)", "('bell',    'sine',     0.145)", 1),
    ("('strings', 'sawtooth', 0.140)", "('strings', 'sawtooth', 0.150)", 1),
])
print('OK')