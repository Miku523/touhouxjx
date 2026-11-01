
import os, sys, json, collections
ROOT = r"C:\Users\GuSheng\Downloads\HKS"
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
MIDI = r"C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\8 - Imperishable Night\15. Flight in the Bamboo Cutter ~ Lunatic Princess (ZUN).mid"
m = M.parse_midi(MIDI)
rows = []
for tr in m['tracks']:
    pend = {}
    for ev in tr['events']:
        k = ev[1]
        if k == 'on': pend.setdefault((ev[2], ev[3]), []).append((ev[0], ev[4]))
        elif k == 'off':
            st = pend.get((ev[2], ev[3]))
            if st:
                t0, v = st.pop(0); rows.append((t0, max(ev[0], t0+1), ev[3], v, ev[2]))
BPM = 154.0
BEAT = 60.0/BPM
notes = []
for t0, t1, p, v, ch in rows:
    bar = t0//1920 + 1
    beat = ((t0 % 1920) / 480.0)
    t = t0 * BEAT / 480.0
    d = (t1 - t0) * BEAT / 480.0
    notes.append({'ch': ch, 't': round(t,4), 'bar': int(bar), 'beat': round(beat,3), 'm': p, 'v': v, 'd': round(d,4)})
notes.sort(key=lambda n: (n['t'], n['m']))
json.dump({'bpm': BPM, 'beat': BEAT, 'bar': 4*BEAT, 'notes': notes}, open(os.path.join(ROOT,'tools/build/_kag_lead','midi_flat.json'),'w'))
print('notes', len(notes), 'bars', max(n['bar'] for n in notes), 'last t', round(max(n['t']+n['d'] for n in notes),3))
# quick first-note offsets: are notes on 16th grid?
off = collections.Counter(round((n['beat']*4) % 1, 2) for n in notes if n['ch'] != 9)
print('beat*4 frac hist', dict(off.most_common(6)))
