import sys, os
sys.path.insert(0, r"C:\Users\GuSheng\Downloads\HKS\tools")
import midi2js as M

BASE = r"C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\6 - The Embodiment of Scarlet Devil"
FILES = [
    "12. The Young Descendant of Tepes (ZUN).mid",
    "10. The Maid and the Pocket Watch of Blood (ZUN).mid",
    "17. Scarlet Tower ~ Eastern Dream... (ZUN).mid",
    "14. The Centennial Festival for Magical Girls (ZUN).mid",
    "8. Voile, the Magic Library (ZUN).mid",
]
NM = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
for f in FILES:
    p = os.path.join(BASE, f)
    if not os.path.exists(p):
        print("MISSING", f); continue
    midi = M.parse_midi(p)
    chans, segs, div = M.extract_channels(midi)
    bpm = M.bpm_of(segs)
    allnotes = [n for c in chans.values() for n in c['notes']]
    end = max(n['t'] + n['d'] for n in allnotes)
    print("=== %s" % f)
    print("  bpm %d  end %.2fs  tempo segs %d  chans %d  notes %d" % (bpm, end, len(segs), len(chans), len(allnotes)))
    hist = [0.0]*12
    for n in allnotes: hist[n['m'] % 12] += n['d']
    tot = sum(hist) or 1
    order = sorted(range(12), key=lambda i: -hist[i])[:4]
    print("  key:", " ".join("%s %.0f%%" % (NM[i], 100*hist[i]/tot) for i in order))
    rows = []
    for ch, c in chans.items():
        ns = c['notes']
        if not ns: continue
        st = M.chan_stats(ns)
        cm = M.channel_metrics(ns)
        st2 = dict(st, **cm)
        rows.append((M.melody_score(st2, end), ch, st, cm, c['progs']))
    rows.sort(reverse=True)
    for sc, ch, st, cm, progs in rows:
        print("   ch%-2d score %.2f n=%-4d med=%-3d poly=%.2f cov=%.2f dens=%.2f prog=%s" %
              (ch, sc, st['count'], st['med'], st['poly'], cm['cov'], cm['dens'], list(progs)[:3]))
