
import json, collections, numpy as np
ROOT = r'C:/Users/GuSheng/Downloads/HKS'
d = json.load(open(ROOT + '/tools/build/_aya_lead/midi_flat.json', encoding='utf-8'))
notes = d['notes']
BAR = d['bar']

MAJ = np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
MIN = np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def ks(ns):
    h = np.zeros(12)
    for n in ns:
        w = max(0.05, n['d'])
        h[n['m'] % 12] += w
    best = []
    for i in range(12):
        rot = np.roll(h, -i)
        best.append((float(np.corrcoef(rot, MAJ)[0,1]), NAMES[i] + 'maj'))
        best.append((float(np.corrcoef(rot, MIN)[0,1]), NAMES[i] + 'min'))
    best.sort(reverse=True)
    return best[:3]

for (a, b) in [(1,24),(25,48),(49,72),(73,84),(85,108),(109,112),(9,112)]:
    ns = [n for n in notes if a <= n['bar'] <= b]
    print('bars %3d-%3d  n=%4d  KS %s' % (a, b, len(ns), ['%s %.3f' % (k, c) for c, k in ks(ns)]))

# top-line：每个 16 分槽取最高音（排除 ch2 piano/ch11 pad/ch9 drums/ch10 bass/ch12 bass）
print()
SLOT = 0.38961 / 4
tot = 14.0
for b in range(1, 113, 2):
    out = []
    for beat16 in range(8):
        t = (b-1)*BAR + beat16 * (BAR/8)
        cands = [n for n in notes if n['ch'] in (0,1,6,7,8) and abs(n['t'] - t) < 0.004]
        out.append('%s' % NAMES[max(cands, key=lambda x: x['m'])['m'] % 12] if cands else '.')
    print('%3d  %s' % (b, ' '.join(out)))
