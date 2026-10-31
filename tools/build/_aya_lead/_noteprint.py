
import json, collections
ROOT = r'C:/Users/GuSheng/Downloads/HKS'
d = json.load(open(ROOT + '/tools/build/_aya_lead/midi_flat.json', encoding='utf-8'))
notes = d['notes']
byc = collections.defaultdict(list)
for n in notes: byc[n['ch']].append(n)
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def nm(m): return NAMES[m % 12] + str(m // 12 - 1)

for (a, b) in [(51, 54), (11, 14), (87, 90)]:
    print('=== bars %d-%d ===' % (a, b))
    for ch in sorted(byc):
        if ch == 9: continue
        ns = [n for n in byc[ch] if a <= n['bar'] <= b]
        if not ns: continue
        s = ' '.join('%d.%g:%s/%g' % (n['bar'] - a, round(n['beat'], 2), nm(n['m']), round(n['d'] / d['beat'], 2)) for n in ns[:30])
        print('ch%2d(%3d): %s' % (ch, len(ns), s))
    print()
