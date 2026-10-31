# -*- coding: utf-8 -*-
import sys, os, json, bisect, collections
ROOT = r'C:/Users/GuSheng/Downloads/HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from midi2js import parse_midi, extract_channels
MID = r'C:/Users/GuSheng/AppData/Local/Temp/thmidi/touhou-midi-collection-main/1 - Shooter Games/6 - The Embodiment of Scarlet Devil/13. Septette for a Dead Princess (ZUN).mid'
m = parse_midi(MID)
chans, segs, div = extract_channels(m)
bar_ticks = div * 4
def tick2sec(tk):
    for i in range(len(segs) - 1, -1, -1):
        t0, s0, us = segs[i]
        if tk >= t0:
            return s0 + (tk - t0) * (us / 1000000.0) / div
    return 0.0
bar_t = [tick2sec(b * bar_ticks) for b in range(0, 92)]
names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def nm(p): return names[p % 12] + str(p // 12 - 1)
def sec2bar(s):
    return bisect.bisect_right(bar_t, s) - 1
def barbeat(n):
    b = sec2bar(n['t'])
    frac = (n['t'] - bar_t[b]) / (bar_t[b+1] - bar_t[b])
    return b, round(frac * 4, 2)
# per-channel pc histograms
for ch in sorted(chans):
    notes = chans[ch].get('notes') or []
    if not notes: continue
    h = collections.Counter(n['m'] % 12 for n in notes)
    top = sorted(h.items(), key=lambda x: -x[1])[:6]
    print('ch%-2d %4d notes  pc: %s' % (ch, len(notes), ' '.join('%s:%d' % (names[k], v) for k, v in top)))
print()
# ch1 bass lowest per bar, ch13 lowest per bar, ch3 melody bar by bar (bars 8-30)
print('=== bass roots (ch1 lowest, ch13 lowest) ===')
for b in range(1, 82):
    lows = []
    for ch in (1, 13, 11):
        ps = [n['m'] for n in chans[ch].get('notes') or [] if sec2bar(n['t']) == b]
        lows.append('%s=%s' % ({1:'bass',13:'pno',11:'gtr'}[ch], nm(min(ps)) if ps else '-'))
    print('bar %2d  %s' % (b, '  '.join(lows)))
print()
print('=== ch3 melody bars 9-24 (bar, beat, pitch, dur) ===')
for n in sorted(chans[3].get('notes') or [], key=lambda x: x['t']):
    b, bt = barbeat(n)
    if 8 <= b <= 30:
        print('  %2d  %4.2f  %-4s dur %5.2f  v%3d' % (b, bt, nm(n['m']), n['d'], n['v']))
