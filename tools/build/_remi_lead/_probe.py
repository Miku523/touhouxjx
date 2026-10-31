# -*- coding: utf-8 -*-
import sys, os, json
ROOT = r'C:/Users/GuSheng/Downloads/HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from midi2js import parse_midi, extract_channels, tick_to_sec, bpm_of

MID = r'C:/Users/GuSheng/AppData/Local/Temp/thmidi/touhou-midi-collection-main/1 - Shooter Games/6 - The Embodiment of Scarlet Devil/13. Septette for a Dead Princess (ZUN).mid'
OUT = os.path.join(ROOT, 'tools', 'build', '_remi_lead')
os.makedirs(OUT, exist_ok=True)

m = parse_midi(MID)
chans, segs, div = extract_channels(m)
print('division', div, 'bpm', round(bpm_of(segs), 3), 'tempo_events', len(segs))
print('segs', json.dumps(segs[:8]))
info = {'file': MID, 'division': div, 'bpm': round(bpm_of(segs), 3), 'segs': segs}
# channels
ch_info = []
for ch in sorted(chans):
    c = chans[ch]
    notes = c.get('notes') or []
    if not notes:
        ch_info.append({'ch': ch, 'notes': 0})
        continue
    ps = [n['m'] for n in notes]
    ts = [n['t'] for n in notes]
    # polyphony
    ev = []
    for n in notes:
        ev.append((n['t'], 1)); ev.append((n['t'] + n['d'], -1))
    ev.sort()
    cur = mx = 0
    for _, d in ev:
        cur += d; mx = max(mx, cur)
    ch_info.append({'ch': ch, 'notes': len(notes), 'min': min(ps), 'max': max(ps),
                    't0': round(min(ts), 2), 't1': round(max(n['t'] + n['d'] for n in notes), 2),
                    'poly': mx, 'progs': c.get('progs'), 'vel_avg': round(sum(n['v'] for n in notes) / len(notes), 1)})
info['channels'] = ch_info
print(json.dumps(ch_info, ensure_ascii=True))

# time signature meta? parse_midi drops meta; use bar length from beat = 0.5s at 145
bar_sec = 4 * 60.0 / info['bpm']
info['barSec'] = round(bar_sec, 4)
end = max(n['t'] + n['d'] for c in chans.values() for n in c.get('notes') or [])
info['end'] = round(end, 3)
print('barSec', round(bar_sec, 4), 'end', round(end, 3), 'bars', round(end / bar_sec, 2))

# bar x channel counts
bars = int(end / bar_sec) + 2
grid = {str(ch): [0] * bars for ch in sorted(chans)}
for ch in sorted(chans):
    for n in chans[ch].get('notes') or []:
        b = int(n['t'] / bar_sec)
        if 0 <= b < bars:
            grid[str(ch)][b] += 1
info['barGrid'] = grid
info['bars'] = bars
open(os.path.join(OUT, 'midi_probe.json'), 'w', encoding='utf-8').write(json.dumps(info, ensure_ascii=False, indent=1))
print('bars', bars)
for ch in sorted(grid):
    row = grid[ch]
    nz = [i for i, v in enumerate(row) if v]
    print('ch', ch, 'nonzero bars', (nz[0], nz[-1]) if nz else None, 'total', sum(row))
