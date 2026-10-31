
import json, collections
ROOT = r'C:/Users/GuSheng/Downloads/HKS'
d = json.load(open(ROOT + '/tools/build/_aya_lead/midi_flat.json', encoding='utf-8'))
notes = d['notes']
byc = collections.defaultdict(list)
for n in notes: byc[n['ch']].append(n)

def seq(ch, b0, b1):
    return [(round(n['beat'],2), n['m']) for n in byc[ch] if b0 <= n['bar'] <= b1]

for ch in (0, 1, 6):
    for off in (100, 50):
        a = seq(ch, 2, 101)
        b = seq(ch, 2+off, 101+off)
        # 粗比：音高集合直方图相似度
        ca = collections.Counter(m for _, m in a); cb = collections.Counter(m for _, m in b)
        inter = sum((ca & cb).values()); tot = max(sum(ca.values()), sum(cb.values()), 1)
        print('ch%d bars2-101 vs %d-%d: n=%d/%d 直方交叠=%.2f' % (ch, 2+off, 101+off, len(a), len(b), inter/tot))
print()
# 每 8 小节 ch0 音数，找段落
for s in range(0, 232, 8):
    row = []
    for ch in sorted(byc):
        if ch == 9: continue
        row.append(sum(1 for n in byc[ch] if s+1 <= n['bar'] <= s+8))
    print('bars %3d-%3d  ' % (s+1, s+8) + ' '.join('%4d' % x for x in row))
