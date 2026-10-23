# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '6 - The Embodiment of Scarlet Devil', '2. A Soul that is Red, like a Ground Cherry (ZUN).mid')
midi = M.parse_midi(MID)
chans, segs, div = M.extract_channels(midi)
bpm = M.bpm_of(segs); ebar = 4*60.0/bpm
first = min(n['t'] for c in chans.values() for n in c)
def rel(t): return t - first
# ch6 每小节：音数 / 力度分布 / 音域
for b0,b1,label in [(1,13,'intro'),(13,29,'A'),(29,37,'B'),(37,45,'C'),(45,53,'bridge/coda')]:
    ns = [n for n in chans[6]['notes'] if b0*ebar <= rel(n['t']) < b1*ebar]
    vs = sorted(n['v'] for n in ns)
    lo = [n for n in ns if n['v'] < 100]
    print('ch6 %-12s bar%2d-%2d  n=%-4d v中位=%-4d v范围%d-%d  v<100=%d' % (
        label, b0, b1, len(ns), vs[len(vs)//2] if vs else 0, vs[0] if vs else 0, vs[-1] if vs else 0, len(lo)))
    if ns:
        top = sorted(ns, key=lambda n: n['t'])
        print('   前 16 音 [t,m,d,v]: ' + ' '.join('[%.2f,%d,%.2f,%d]' % (rel(n['t']), n['m'], n['d'], n['v']) for n in top[:16]))
