
import json, collections
ROOT = r'C:/Users/GuSheng/Downloads/HKS'
d = json.load(open(ROOT + '/tools/build/_aya_lead/midi_flat.json', encoding='utf-8'))
notes = d['notes']
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def nm(m): return NAMES[m % 12] + str(m // 12 - 1)
# 只取 ch0（主旋律；其中已含 +12 叠音，取最低音为线）
for b in range(1, 113):
    ns = sorted([n for n in notes if n['ch'] == 0 and n['bar'] == b], key=lambda n: n['t'])
    if not ns:
        print('%3d  -' % b); continue
    # 折叠同刻叠音：取每刻最低音
    seen = {}
    for n in ns:
        k = round(n['t'], 3)
        seen[k] = min(seen.get(k, 999), n['m'])
    seq = [nm(seen[k]) for k in sorted(seen)]
    print('%3d  %s' % (b, ' '.join(seq[:16]) + (' ...' if len(seq) > 16 else '')))
