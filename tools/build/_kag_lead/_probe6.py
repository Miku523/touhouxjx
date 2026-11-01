
import os, sys, collections
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
CH = collections.defaultdict(list)
for t0,t1,p,v,ch in rows: CH[ch].append((t0,t1,p,v))
def show(ch, b0, b1):
    print('== ch%d bars %d-%d' % (ch, b0, b1))
    for b in range(b0, b1+1):
        lo, hi = (b-1)*1920, b*1920
        sub = sorted([x for x in CH[ch] if lo <= x[0] < hi], key=lambda x: x[0])
        if not sub: print('%3d  -' % b); continue
        print('%3d  ' % b + ' '.join('%d@%.2f/%.2f' % (p, ((t0-lo)/480), (t1-t0)/480) for (t0,t1,p,v) in sub[:16]))
show(10, 19, 30)
show(8, 84, 92)
show(11, 62, 66)
show(3, 37, 40)
show(13, 45, 48)
