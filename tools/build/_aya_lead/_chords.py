
import json, collections, statistics
ROOT = r'C:/Users/GuSheng/Downloads/HKS'
d = json.load(open(ROOT + '/tools/build/_aya_lead/midi_flat.json', encoding='utf-8'))
notes = d['notes']
byc = collections.defaultdict(list)
for n in notes: byc[n['ch']].append(n)

NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def pcname(m): return NAMES[m % 12]

print('bar  bass(pc)x  top-line(n/med)  pcs')
for b in range(1, 113):
    bass = [n for n in byc[10] if n['bar'] == b]
    top = [n for ch in (0,1,6,7,8) for n in byc[ch] if n['bar'] == b]
    pcs = collections.Counter(n['m'] % 12 for n in (bass + top))
    rootpc = collections.Counter(n['m'] % 12 for n in bass).most_common(1)[0][0] if bass else -1
    med = statistics.median([n['m'] for n in top]) if top else 0
    order = ''.join(pcname(p) + ('' if c < 3 else '') for p, c in pcs.most_common(4))
    print('%3d  %3s  %3d/%3d  %s' % (b, pcname(rootpc) if rootpc >= 0 else '--', len(top), med, order))
