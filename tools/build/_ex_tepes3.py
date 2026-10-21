import sys, os
sys.path.insert(0, r"C:\Users\GuSheng\Downloads\HKS\tools")
import midi2js as M
BASE = r"C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\6 - The Embodiment of Scarlet Devil"
NM = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def nm(m): return NM[m % 12] + str(m // 12 - 1)

midi = M.parse_midi(os.path.join(BASE, "12. The Young Descendant of Tepes (ZUN).mid"))
div = midi['division'] or 480
raw = {}
for tr in midi['tracks']:
    pend = {}
    for ev in tr['events']:
        if ev[1] == 'on': pend.setdefault((ev[2], ev[3]), []).append((ev[0], ev[4]))
        elif ev[1] == 'off':
            st = pend.get((ev[2], ev[3]))
            if st:
                t0, v = st.pop(0); raw.setdefault(ev[2], []).append((t0, ev[0], ev[3], v))
for ch in raw: raw[ch].sort()

def show(ch, lo=None, hi=None):
    ns = raw[ch]
    print("=== ch%d n=%d" % (ch, len(ns)))
    print("  ", " ".join("%s(%.2f)" % (nm(m), (t1 - t0) / div / 1.0) for (t0, t1, m, v) in ns[(lo or 0):(hi or len(ns))]))

show(12)
show(13)
# 判断 ch12 是否 ch2 的加倍
for a, b in ((12, 2), (13, 3), (4, 2)):
    na = {(round(t0 / div, 2), m) for (t0, t1, m, v) in raw[a]}
    hits = 0; tot = 0
    for (t0, t1, m, v) in raw[b]:
        tot += 1
        if any(abs(m - m2) % 12 == 0 and abs(t0 - t0b) <= 60 for (t0b, m2) in na):
            hits += 1
    print("ch%d 与 ch%d 同刻同音级命中 %.2f (%d/%d)" % (a, b, hits / max(1, tot), hits, tot))
