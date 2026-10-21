# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import preview_song as PS
s = PS.load_song(os.path.join(ROOT,'src','engine','songs','fall_pre4.js'),'FALL_PRE4','pre4')
def nd(n): return n if isinstance(n,dict) else dict(t=n[0],m=n[1],d=n[2],v=n[3])
for i, tr in enumerate(s['tracks']):
    for rng, lab in (((52.2, 53.9), '53接缝'), ((58.3, 59.0), '末尾')):
        ns = sorted((nd(n) for n in tr['notes'] if rng[0] <= nd(n)['t'] <= rng[1]), key=lambda n: n['t'])
        if ns:
            print('轨%d %-8s g%.2f %s: %s' % (i, tr['wave'], tr['gain'], lab,
                  ' '.join('%s:%d/%.2f' % (round(n['t'],2), n['m'], round(n['d'],2)) for n in ns[:9])))
print('duration', s['duration'])
