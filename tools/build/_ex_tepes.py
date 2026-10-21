import sys, os
sys.path.insert(0, r"C:\Users\GuSheng\Downloads\HKS\tools")
import midi2js as M
BASE = r"C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\6 - The Embodiment of Scarlet Devil"
p = os.path.join(BASE, "12. The Young Descendant of Tepes (ZUN).mid")
midi = M.parse_midi(p)
chans, segs, div = M.extract_channels(midi)
print("segs", [(round(s[0],2), round(s[1],3), s[2]) for s in segs])
bar = 4 * segs[0][2] / 1e6
print("bpm", M.bpm_of(segs), "bar %.4f" % bar)
NM = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
for ch, c in sorted(chans.items()):
    ns = c['notes']
    if not ns: continue
    hist = [0.0]*12
    for n in ns: hist[n['m'] % 12] += n['d']
    tot = sum(hist) or 1
    top = sorted(range(12), key=lambda i: -hist[i])[:5]
    print("--- ch%d prog=%s n=%d  t %.2f-%.2f  m %d-%d" % (ch, list(c['progs'])[:3], len(ns), ns[0]['t'], ns[-1]['t'], min(n['m'] for n in ns), max(n['m'] for n in ns)))
    print("    key:", " ".join("%s%.0f" % (NM[i], 100*hist[i]/tot) for i in top))
    print("    first24:", " ".join("%s@%.2f" % (NM[n['m']%12]+str(n['m']//12-1), n['t']) for n in ns[:24]))
