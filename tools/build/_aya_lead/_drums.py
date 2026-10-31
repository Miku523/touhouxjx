
import json, collections
ROOT = r'C:/Users/GuSheng/Downloads/HKS'
d = json.load(open(ROOT + '/tools/build/_aya_lead/midi_flat.json', encoding='utf-8'))
notes = [n for n in d['notes'] if n['ch'] == 9]
print('drum pitches:', collections.Counter(n['m'] for n in notes).most_common())
def pattern(b0, b1):
    print('--- bars %d-%d ---' % (b0, b1))
    for p in sorted({n['m'] for n in notes}):
        sel = [n for n in notes if n['m'] == p and b0 <= n['bar'] <= b1]
        if not sel: continue
        c = collections.Counter(round(n['beat'], 3) for n in sel)
        cnt = collections.Counter(round(n['beat'], 3) for n in sel)
        print('  %3d  %s' % (p, ' '.join('%.2f:%d' % (b, k) for b, k in sorted(cnt.items()))))
for (a, b) in [(3, 8), (9, 16), (29, 34), (57, 62), (85, 90)]:
    pattern(a, b)
print()
print('每小节鼓击数（前 112 小节）:')
row = []
for b in range(1, 113):
    n = sum(1 for x in notes if x['bar'] == b)
    row.append('%d' % n if n < 10 else chr(ord('A') + n - 10) if n < 36 else '*')
print(''.join(row))
