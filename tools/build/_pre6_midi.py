# -*- coding: utf-8 -*-
# 6 面道中《ヴォヤージュ1970》原曲 MIDI 解剖
import os, sys, collections
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M

MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '8 - Imperishable Night', '16. Voyage 1970 (ZUN).mid')
midi = M.parse_midi(MID)
chans, segs, div = M.extract_channels(midi)
q = 4.0 * div
sec = lambda bar: M.tick_to_sec(segs, div, int(round(bar * q)))
print('division', div, 'segs', len(segs), 'tracks', len(midi['tracks']))
print('tempo segs:', [(s[0], round(s[1], 2), round(60e6 / s[2], 2)) for s in segs][:30])
last = max(n['t'] + n['d'] for c in chans.values() for n in c['notes'])
print('last note end %.2fs' % last, ' 每小节 %.4fs' % (q / div * segs[0][2] / 1e6))
print('内容起点 bar? 首音集 tick 最小 =', min(n['t'] for c in chans.values() for n in c['notes']))
for ch in sorted(chans):
    c = chans[ch]
    ns = c['notes']
    lo = min(n['m'] for n in ns); hi = max(n['m'] for n in ns)
    t0 = min(n['t'] for n in ns); t1 = max(n['t'] + n['d'] for n in ns)
    progs = c['progs']
    print('ch%-2d prog=%-22s n=%-5d m %d-%d  %.2f-%.2fs  bar %.2f-%.2f' % (
        ch, str(progs), len(ns), lo, hi, t0, t1, t0 / (q * 1.0) * 1 + 0, t1 / (q * 1.0) * 1 + 0))
