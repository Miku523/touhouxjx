
import json, collections
ROOT = r'C:/Users/GuSheng/Downloads/HKS'
d = json.load(open(ROOT + '/tools/build/_aya_lead/midi_flat.json', encoding='utf-8'))
notes = d['notes']
byc = collections.defaultdict(list)
for n in notes: byc[n['ch']].append(n)

target = [72, 68, 65, 75]
for ch in sorted(byc):
    seq = [(n['bar'], round(n['beat'], 3), n['m']) for n in byc[ch]]
    for i in range(len(seq) - 3):
        if [seq[i][2], seq[i+1][2], seq[i+2][2], seq[i+3][2]] == target and seq[i+1][1] - seq[i][1] < 0.3:
            print('ch%d hit at bar %d beat %.2f' % (ch, seq[i][0], seq[i][1]))
            break
print()
# 每通道每 8 小节的中位音高与音数（找段落高度变化）
import statistics
chs = [0,1,2,6,7,8,10,11]
print('bars      ' + ' '.join('ch%-2d(n/med)' % c for c in chs))
for s in range(0, 232, 16):
    cells = []
    for ch in chs:
        ns = [n for n in byc[ch] if s+1 <= n['bar'] <= s+16]
        cells.append('%3d/%2d' % (len(ns), statistics.median([n['m'] for n in ns]) if ns else 0))
    print('%3d-%3d  ' % (s+1, s+16) + ' '.join(cells))
