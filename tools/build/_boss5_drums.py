# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\7 - Perfect Cherry Blossom'
midi = M.parse_midi(BASE + r'\13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid')
chans, segs, div = M.extract_channels(midi)
bpm = M.bpm_of(segs); bar = 4*60/bpm
print('drum counts per 4 bars:  b0-15 / b16-31 / b32-39 / b40-55 / b56-69 / b70-87')
for rng in [(0,16),(16,32),(32,40),(40,56),(56,72),(72,88)]:
    t0, t1 = rng[0]*bar, rng[1]*bar
    ds = [n for n in chans[9]['notes'] if t0 <= n['t'] < t1]
    from collections import Counter
    c = Counter(n['m'] for n in ds)
    print('%2d-%2d  total %4d  ' % (rng[0], rng[1]-1, len(ds)) + ' '.join('%d:%d' % (k, v) for k, v in sorted(c.items())))
print()
print('=== ch9 pattern bars 8-9 (grid 1/16) ===')
for b in [8, 9, 40, 41]:
    t0 = b*bar
    ds = sorted([n for n in chans[9]['notes'] if t0 <= n['t'] < t0+bar], key=lambda n: n['t'])
    print('b%d: ' % b + ' '.join('%g:%d' % (round((n['t']-t0)/(bar/16), 1), n['m']) for n in ds))
print()
print('=== ch1 low notes (bass candidates) bars 0-16 ===')
for b in range(0, 16):
    t0, t1 = b*bar, (b+1)*bar
    ns = [n for n in chans[1]['notes'] if t0 <= n['t'] < t1 and n['m'] < 55]
    print('b%02d %s' % (b, ' '.join('%s@%g' % (n['m'], round((n['t']-t0)/(bar/16),1)) for n in ns)))
