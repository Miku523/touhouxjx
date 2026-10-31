# -*- coding: utf-8 -*-
import os, sys, json, collections
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
MIDI = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                    '8 - Imperishable Night', '3. Wriggling Autumn Moon ~ Mooned Insect (ZUN).mid')
mid = M.parse_midi(MIDI); div = mid['division'] or 480
segs = M.build_tempo_map(mid['tracks'], div)
chans, _, _ = M.extract_channels(mid)
def tsec(tick): return M.tick_to_sec(segs, div, int(tick))
PITCH = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
BAR = 1.5483870967741935  # 155bpm 4/4
# bar of a time: use tick map inverse approx by mapping tick grid directly is easier: compute bar start seconds
def bar_start_sec(b): return tsec((b-1)*1920)
def bar_of_time(t):
    lo, hi = 1, 52
    while lo+1 < hi:
        mid_b = (lo+hi)//2
        if bar_start_sec(mid_b) <= t: lo = mid_b
        else: hi = mid_b
    return lo

print('bar starts:', [(b, round(bar_start_sec(b),2)) for b in (1,2,9,10,17,18,25,26,33,34,41,42,49,50,51)])
print('end sec', round(tsec(96000),2), 'max', round(tsec(95940),2))

# channel activity per 8-bar group
groups = [(1,8),(9,16),(17,24),(25,32),(33,40),(41,50)]
print('\nactivity (notes) per channel per group')
print('ch ', ' '.join('%9s'%('%d-%d'%g) for g in groups))
for ch in sorted(chans):
    if ch == 9: continue
    line=[]
    for a,b in groups:
        c = sum(1 for n in chans[ch]['notes'] if a <= bar_of_time(n['t']) <= b)
        line.append('%9d'%c)
    print('%2d '%ch, ' '.join(line))

# bass roots per bar from ch2 (lowest) else ch9
def root_of(bar):
    ns=[]
    t0=bar_start_sec(bar); t1=bar_start_sec(bar+1)
    for ch in (2,9):
        if ch in chans:
            ns += [n['m'] for n in chans[ch]['notes'] if t0-1e-6 <= n['t'] < t1-1e-6]
    if not ns: return None
    return min(ns) % 12
print('\nbass roots by bar')
print(' '.join('%s%s' % (PITCH[root_of(b)] if root_of(b) is not None else '--', '' ) for b in range(1,51)))

# lead candidates: for each channel print first notes and per-bar med
for ch in (0,3,5,6,7,10,11):
    ns = chans[ch]['notes']
    print('\n== ch', ch, 'first 18:', [(round(n['t'],2), n['m'], round(n['d'],2), n['v']) for n in ns[:18]])
