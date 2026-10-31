
import json, collections, statistics
ROOT = r'C:/Users/GuSheng/Downloads/HKS'
d = json.load(open(ROOT + '/tools/build/_aya_lead/midi_flat.json', encoding='utf-8'))
notes = d['notes']
byc = collections.defaultdict(list)
for n in notes: byc[n['ch']].append(n)

def stats(ch, b0, b1):
    ns = [n for n in byc[ch] if b0 <= n['bar'] <= b1]
    if not ns: return '   --      '
    ps = [n['m'] for n in ns]
    return '%3d %2d-%2d %2d' % (len(ns), min(ps), max(ps), statistics.median(ps)) if False else '%3d %3d-%3d' % (len(ns), min(ps), max(ps))

chs = [0,1,2,6,7,8,10,11]
print('bars     ' + '  '.join('ch%d        ' % c for c in chs))
for s in range(0, 120, 8):
    row = '  '.join(stats(c, s+1, s+8) for c in chs)
    print('%3d-%3d %s' % (s+1, s+8, row))

print()
# 单声部程度：每通道连续音数占比（同一 tick 上叠音少 = 旋律）
for ch in chs:
    ns = byc[ch]
    tm = collections.Counter(round(n['t'], 3) for n in ns)
    poly = sum(1 for v in tm.values() if v > 1) / max(1, len(tm))
    print('ch%2d  n=%4d  多音同刻占比 %.2f  med_dur %.2f' % (ch, len(ns), poly, statistics.median([n['d'] for n in ns])))
