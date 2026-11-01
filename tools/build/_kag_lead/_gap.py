import sys, os, collections
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M2
MIDI = os.path.join(os.environ['TEMP'], 'thmidi', 'touhou-midi-collection-main', '1 - Shooter Games',
                    '8 - Imperishable Night', '15. Flight in the Bamboo Cutter ~ Lunatic Princess (ZUN).mid')
m = M2.parse_midi(MIDI)
evs = m['tracks'][0]['events']
ons = [e for e in evs if e[1] == 'on']
ticks = sorted(e[0] for e in ons)
print('n ons', len(ticks), 'first', ticks[0], 'last', ticks[-1], 'max', (ticks[-1]//1920))
# 大间隙
gaps = [(ticks[i+1]-ticks[i], ticks[i], ticks[i+1]) for i in range(len(ticks)-1)]
gaps.sort(reverse=True)
print('top gaps:', gaps[:8])
# 密度：每 480 tick 窗口的 on 数，落在 99000-101500 附近
cnt = collections.Counter(t // 480 for t in ticks)
for w in range(200, 216):
    print('window %d (tick %d) count %d' % (w, w*480, cnt.get(w, 0)))
