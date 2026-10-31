# -*- coding: utf-8 -*-
import os, sys, collections
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
MIDI = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                    '8 - Imperishable Night', '3. Wriggling Autumn Moon ~ Mooned Insect (ZUN).mid')
mid = M.parse_midi(MIDI); div = mid['division'] or 480
segs = M.build_tempo_map(mid['tracks'], div)
chans, _, _ = M.extract_channels(mid)
def tsec(t): return M.tick_to_sec(segs, div, int(t))
PITCH=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def bar_start(b): return tsec((b-1)*1920)
def bar_of(t):
    lo,hi=1,52
    while lo+1<hi:
        m=(lo+hi)//2
        if bar_start(m)<=t: lo=m
        else: hi=m
    return lo

for ch in (2,5,9):
    ns = chans[ch]['notes']
    print('== ch', ch, 'first 14:', [(round(n['t'],2), n['m'], round(n['d'],2), n['v']) for n in ns[:14]])
    print('   pitch hist', collections.Counter(n['m'] for n in ns).most_common(10))

# per-bar: all melodic pcs (sorted by count), plus lowest note pc across ch2/ch5
print('\nbar | pcs (melodic, top4) | low pc')
for b in range(1,51):
    t0,t1 = bar_start(b), bar_start(b+1)
    pc = collections.Counter()
    lows=[]
    for ch in (0,3,4,6,7,8,10,11,14,5):
        for n in chans[ch]['notes']:
            if t0-1e-6 <= n['t'] < t1-1e-6:
                pc[n['m']%12]+=1
    for ch in (2,5):
        for n in chans[ch]['notes']:
            if t0-1e-6 <= n['t'] < t1-1e-6:
                lows.append((n['m'], n['t']))
    low = min(lows)[0] if lows else None
    top = ' '.join('%s:%d'%(PITCH[k],v) for k,v in pc.most_common(4))
    print('%2d | %-34s | %s' % (b, top, PITCH[low%12] if low is not None else '--'))

# drums stats
ns = chans[9]['notes']
print('\ndrum pitches', collections.Counter(n['m'] for n in ns).most_common(12))
print('drums per bar avg', round(len(ns)/50,1))
