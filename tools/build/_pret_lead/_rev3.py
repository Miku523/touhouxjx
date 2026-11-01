# -*- coding: utf-8 -*-
import os, json, io
import numpy as np, soundfile as sf
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
LEAD = os.path.join(ROOT, 'tools/build/_pret_lead')
STEMS = {'pre1': 'stems_pre1_v3', 'pre2': 'stems_pre2_v2', 'pre3': 'stems_pre3_v3', 'pre4': 'stems_pre4_v3', 'pre6': 'stems_pre6_v2'}
for n in ('pre1','pre2','pre3','pre4','pre6'):
    song = json.load(io.open(os.path.join(LEAD, n + '_song.json'), encoding='utf-8'))
    sec = [(t, a, b) for t, a, b in json.load(io.open(os.path.join(LEAD, n + '_secs.json'), encoding='utf-8'))['secs']]
    kinds = {}
    for z in song['drums']:
        k = z[1] if isinstance(z, (list, tuple)) else z['kind']
        kinds[k] = kinds.get(k, 0) + 1
    print('==', n, 'drums', len(song['drums']), 'kinds', dict(sorted(kinds.items())))
    d = os.path.join(LEAD, STEMS[n])
    if not os.path.isdir(d):
        print('   (no stems)')
        continue
    files = sorted(os.listdir(d))
    for f in files:
        if not f.endswith('.wav') or f.startswith('90'):
            continue
        x, sr = sf.read(os.path.join(d, f), always_2d=True)
        x = x.mean(axis=1)
        vals = []
        for t, a, b in sec:
            seg = x[int(a*sr):int(b*sr)]
            r = 20*np.log10(max(float(np.sqrt(np.mean(seg**2))) if seg.size else 1e-9, 1e-9))
            vals.append('%s %.0f' % (t, r))
        print('   %-14s %s' % (f, ' | '.join(vals)))
    x, sr = sf.read(os.path.join(d, '90_drums.wav'), always_2d=True)
    x = x.mean(axis=1)
    vals = []
    for t, a, b in sec:
        seg = x[int(a*sr):int(b*sr)]
        r = 20*np.log10(max(float(np.sqrt(np.mean(seg**2))) if seg.size else 1e-9, 1e-9))
        vals.append('%s %.0f' % (t, r))
    print('   %-14s %s' % ('90_drums', ' | '.join(vals)))
