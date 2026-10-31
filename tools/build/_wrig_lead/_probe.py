# -*- coding: utf-8 -*-
import os, sys, json, collections
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
MIDI = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                    '8 - Imperishable Night', '3. Wriggling Autumn Moon ~ Mooned Insect (ZUN).mid')
OUT = os.path.join(ROOT, 'tools', 'build', '_wrig_lead'); os.makedirs(OUT, exist_ok=True)
mid = M.parse_midi(MIDI)
div = mid['division'] or 480
segs = M.build_tempo_map(mid['tracks'], div)
chans, _, _ = M.extract_channels(mid)
def tsec(tick): return M.tick_to_sec(segs, div, int(tick))
print('division', div, 'tempo segments', len(segs))
print('segs', [(s[0], round(s[1],3), round(60e6/s[2],2)) for s in segs])

# raw note-ons for tick grid
ons = []
for ti, tr in enumerate(mid['tracks']):
    for ev in tr['events']:
        if ev[1] == 'on' and ev[4] > 0:
            ons.append((ev[0], ev[2], ev[3], ev[4], ti))
ons.sort()
max_tick = max(o[0] for o in ons)
print('ons', len(ons), 'max_tick', max_tick, 'end_sec', round(tsec(max_tick),3), 'first_sec', round(tsec(ons[0][0]),3))
for g in (1920, 480, 240, 120):
    h = collections.Counter(o[0] % g for o in ons)
    print('mod', g, h.most_common(5))

# tempo changes: bpm per seg
print('bpm list', [round(60e6/s[2],2) for s in segs])

# per channel stats
print('\nch notes lo-hi prog t0 t1  topPC')
for ch in sorted(chans):
    c = chans[ch]; ns = c['notes']
    lo = min(n['m'] for n in ns); hi = max(n['m'] for n in ns)
    t0 = min(n['t'] for n in ns); t1 = max(n['t']+n['d'] for n in ns)
    pc = collections.Counter(n['m'] % 12 for n in ns).most_common(4)
    print(ch, len(ns), '%d-%d' % (lo,hi), c.get('progs'), round(t0,2), round(t1,2), pc)

json.dump({'div':div, 'segs':[[s[0], s[1], s[2]] for s in segs], 'ons':len(ons), 'max_tick':max_tick}, open(os.path.join(OUT,'grid.json'),'w',encoding='utf-8'), ensure_ascii=False)
print('saved grid.json')
