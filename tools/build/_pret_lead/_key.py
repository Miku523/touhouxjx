
import os, sys, json, collections
LEAD = os.path.dirname(os.path.abspath(__file__))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
name = sys.argv[1]
d = json.load(open(os.path.join(LEAD, name + '_flat.json'), encoding='utf-8'))
notes = d['notes']
print(name, 'bpm', d['bpm'])
# global pc hist weighted by duration
h = collections.Counter()
for n in notes:
    if n['ch'] != 9:
        h[n['m'] % 12] += max(1, n['d'] * 10)
tot = sum(h.values())
print('pc:', ' '.join('%s %.0f%%' % (NAMES[k], 100.0 * v / tot) for k, v in sorted(h.items(), key=lambda x: -x[1])[:12]))
# per-channel medians per 8-bar block
byc = collections.defaultdict(list)
for n in notes:
    byc[n['ch']].append(n)
for ch in sorted(byc):
    ns = byc[ch]
    if ch == 9: continue
    med = sorted(x['m'] for x in ns)[len(ns)//2]
    pc = collections.Counter(x['m'] % 12 for x in ns).most_common(4)
    print('ch%-2d n=%-4d med%-3d range %d-%d  pc %s' % (ch, len(ns), med, min(x['m'] for x in ns), max(x['m'] for x in ns), [(NAMES[a], b) for a, b in pc]))
