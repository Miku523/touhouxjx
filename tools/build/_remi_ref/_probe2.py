# -*- coding: utf-8 -*-
import sys, os
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build\_exsr_ref')
import _midilib as M
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
MID = os.path.join(BASE, '1 - Shooter Games', '6 - The Embodiment of Scarlet Devil',
                   '13. Septette for a Dead Princess (ZUN).mid')
p = M.parse_file(MID); g = M.build_grid(p); ns = M.notes(p, g)
NB = len(g['bars'])
print('NB', NB)
# per-bar per-channel counts
chans = list(range(16))
print('bar ' + ' '.join('%3d'%c for c in chans))
for b in range(NB):
    row = []
    for c in chans:
        cnt = sum(1 for n in ns if n['bar']==b and n['ch']==c)
        row.append(cnt)
    if sum(row)==0:
        print('%3d '%b + ' '.join('  0' if x==0 else '%3d'%x for x in row))
    else:
        print('%3d '%b + ' '.join('%3d'%x for x in row))
print('--- first/last note per ch (bar.beat 1-based)')
for c in chans:
    sub=[n for n in ns if n['ch']==c]
    if not sub: continue
    f=sub[0]; l=sub[-1]
    print('ch%2d first bar %5.2f pitch %s  last bar %5.2f' % (c, f['bar']+f['beat'], M.pname(f['pitch']), l['bar']+l['beat']))
print('--- drum pitch histogram (ch9)')
h={}
for n in ns:
    if n['ch']==9: h[n['pitch']]=h.get(n['pitch'],0)+1
for k in sorted(h): print(' drum', k, M.pname(k), h[k])
print('--- ch11 sample notes')
s11=[n for n in ns if n['ch']==11][:40]
print(' '.join('%s@%d.%.2f' % (M.pname(n['pitch']), n['bar']+1, n['beat']) for n in s11))
