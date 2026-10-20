# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import preview_song as PS
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\ateam_stage3.js','ATEAM_STAGE3','stage3')
bar = 4*60/s['bpm']
def nd(n): return n if isinstance(n,dict) else dict(t=n[0],m=n[1],d=n[2],v=n[3])
print('bpm', s['bpm'], 'bar %.3f' % bar, 'dur', s['duration'])
print('小节 | ' + ' | '.join('%s%.2f' % (t['wave'][:4], t['gain']) for t in s['tracks']) + ' | 鼓')
for b in range(0, 32):
    t0, t1 = b*bar, (b+1)*bar
    cells=[]
    for t in s['tracks']:
        c=sum(1 for n in t['notes'] if t0 <= nd(n)['t'] < t1)
        cells.append('%3d' % c)
    d=sum(1 for x in s['drums'] if t0 <= x[0] < t1)
    print('%3d  | %s | %3d' % (b, ' | '.join(cells), d))
