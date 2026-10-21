# -*- coding: utf-8 -*-
# 另一份 Voyage 1970 MIDI（yoimutu）对比
import os, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
p = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                 '8 - Imperishable Night', '16. Voyage 1970 (yoimutu).mid')
midi = M.parse_midi(p)
chans, segs, div = M.extract_channels(midi)
q = 4.0 * div
print('segs', len(segs), 'div', div, 'bar %.4fs' % (M.tick_to_sec(segs, div, int(q))))
print('tempo', [(round(60e6/s[2],2), round(s[1],2)) for s in segs][:12])
for ch in sorted(chans):
    ns = chans[ch]['notes']
    lo = min(n['m'] for n in ns); hi = max(n['m'] for n in ns)
    t0 = min(n['t'] for n in ns); t1 = max(n['t'] + n['d'] for n in ns)
    ds = sorted(n['d'] for n in ns)
    print('ch%-2d prog=%-16s n=%-5d m %d-%d  %.2f-%.2fs  dur med %.3f' % (ch, str(chans[ch]['progs']), len(ns), lo, hi, t0, t1, ds[len(ds)//2]))
