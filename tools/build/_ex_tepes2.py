import sys, os
sys.path.insert(0, r"C:\Users\GuSheng\Downloads\HKS\tools")
import midi2js as M
BASE = r"C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\6 - The Embodiment of Scarlet Devil"
p = os.path.join(BASE, "12. The Young Descendant of Tepes (ZUN).mid")
midi = M.parse_midi(p)
div = midi['division'] or 480
print("division", div)
# 直接按 tick 汇总每通道
raw = {}
for tr in midi['tracks']:
    pend = {}
    for ev in tr['events']:
        if ev[1] == 'on':
            pend.setdefault((ev[2], ev[3]), []).append((ev[0], ev[4]))
        elif ev[1] == 'off':
            st = pend.get((ev[2], ev[3]))
            if st:
                t0, v = st.pop(0)
                raw.setdefault(ev[2], []).append((t0, ev[0], ev[3], v))
for ch in raw: raw[ch].sort()
NM = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def nm(m): return NM[m % 12] + str(m // 12 - 1)
bar = div * 4
for ch in (2, 3, 12, 13):
    if ch not in raw: continue
    print("=== ch%d" % ch)
    last = None
    for (t0, t1, m, v) in raw[ch]:
        b = t0 // bar
        if b != last:
            print("  bar%-3d" % b, end="")
            last = b
        print(" %s/%d" % (nm(m), t1 - t0), end="")
        if (t0 // bar) != ((t1) // bar):
            pass
    print()
