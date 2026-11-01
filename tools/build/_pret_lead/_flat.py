
import os, sys, json, collections
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
BASE = r"C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games"
SONGS = [
 ('pre1', r"6 - The Embodiment of Scarlet Devil\2. A Soul that is Red, like a Ground Cherry (ZUN).mid"),
 ('pre2', r"8 - Imperishable Night\2. Illusionary Night ~ Ghostly Eyes (ZUN).mid"),
 ('pre3', r"6 - The Embodiment of Scarlet Devil\4. Lunate Elf (ZUN).mid"),
 ('pre4', r"10 - Mountain of Faith\8. Fall of Fall ~ Autumnal Waterfall (Hisaraito).mid"),
 ('pre6', r"8 - Imperishable Night\16. Voyage 1970 (ZUN).mid"),
]
OUT = os.path.join(ROOT, 'tools', 'build', '_pret_lead')
def load(path):
    m = M.parse_midi(path); div = m['division']; rows = []; tempos = []
    for tr in m['tracks']:
        pend = {}
        for ev in tr['events']:
            k = ev[1]
            if k == 'tempo': tempos.append((ev[0], ev[2]))
            elif k == 'on': pend.setdefault((ev[2], ev[3]), []).append((ev[0], ev[4]))
            elif k == 'off':
                st = pend.get((ev[2], ev[3]))
                if st:
                    t0, v = st.pop(0); rows.append((t0, max(ev[0], t0 + 1), ev[3], v, ev[2]))
    return div, rows, tempos
def main_tempo(tempos):
    ded = {}
    for t, u in sorted(tempos): ded[t] = u
    pts = sorted(ded.items())
    if not pts: return 120.0
    spans = []
    for i, (t, u) in enumerate(pts):
        nxt = pts[i + 1][0] if i + 1 < len(pts) else 10**9
        spans.append((nxt - t, u))
    spans.sort(reverse=True)
    return round(60e6 / spans[0][1], 3)
for name, rel in SONGS:
    div, rows, tempos = load(os.path.join(BASE, rel))
    bpm = main_tempo(tempos); beat = 60.0 / bpm; bar = 4 * beat
    mods = collections.Counter(t0 % div for t0, t1, p, v, ch in rows if ch != 9)
    cands = [m for m, _ in mods.most_common(6)]
    # for each candidate, count notes exactly on downbeats (x%1920==0) and on beats
    diag = []
    for off in cands:
        down = sum(1 for t0, *_ in rows if (t0 - off) % (div * 4) == 0)
        beatn = sum(1 for t0, *_ in rows if (t0 - off) % div == 0)
        diag.append((off, down, beatn))
    print('%-5s bpm %.1f  mod-top %s  (offset, downbeat, onbeat) %s' % (name, bpm, mods.most_common(4), diag))
    off = diag[0][0]
    notes = []
    for t0, t1, m, v, ch in rows:
        x = t0 - off
        b = x // (div * 4) + 1
        bt = (x % (div * 4)) / float(div)
        t = (b - 1) * bar + bt * beat
        d = (t1 - t0) * beat / float(div)
        notes.append({'ch': ch, 't': round(t, 4), 'bar': int(b), 'beat': round(bt, 3),
                      'm': m, 'v': v, 'd': round(max(d, 0.03), 4)})
    notes.sort(key=lambda n: (n['t'], n['m']))
    lastbar = max(n['bar'] for n in notes)
    dur = max(n['t'] + n['d'] for n in notes)
    json.dump({'bpm': bpm, 'beat': beat, 'bar': bar, 'offset': off, 'division': div, 'notes': notes},
              open(os.path.join(OUT, name + '_flat.json'), 'w', encoding='utf-8'))
    print('      notes %d  lastbar %d  dur %.3f  first t %.3f' % (len(notes), lastbar, dur, min(n['t'] for n in notes)))
