# -*- coding: utf-8 -*-
import sys, json
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
tracks = json.load(open(r'C:\Users\GuSheng\Downloads\HKS\tools\build\_s5_tracks.json', encoding='utf-8')) if False else None
import subprocess
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
tracks = json.loads(subprocess.run(['node', r'tools\build\_s5_raw.mjs'], cwd=ROOT, capture_output=True, text=True, encoding='utf-8').stdout)
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def pn(m): return NAMES[m%12] + str(m//12-1)
bar = 4*60/144
for ti, tr in enumerate(tracks):
    print('\n#### game track%d n=%d' % (ti, len(tr)))
    for b in range(0, 30):
        t0 = b*bar
        ns = sorted([n for n in tr if t0-1e-6 <= n[0] < t0+bar], key=lambda n: (n[0], n[1]))
        if not ns: print('b%02d ---' % b); continue
        s = ' '.join('%g:%s(%g)' % (round((n[0]-t0)/(bar/16),2), pn(n[1]), round(n[2],2)) for n in ns)
        print('b%02d %s' % (b, s[:160]))
