
import sys, os, json, collections, statistics
sys.path.insert(0, r'C:/Users/GuSheng/Downloads/HKS/tools')
import midi2js as M2
BASE = r'C:/Users/GuSheng/AppData/Local/Temp/thmidi/touhou-midi-collection-main/1 - Shooter Games/9 - Phantasmagoria of Flower View'
NAME = '11. Wind God Girl (rongns_2).mid'
m = M2.parse_midi(os.path.join(BASE, NAME))
GRID = 1920
rows = []
for tr in m['tracks']:
    stack = {}
    evs = tr['events']
    for e in evs:
        if e[1] == 'on' and (len(e) < 5 or e[4] > 0):
            stack.setdefault((e[2], e[3]), []).append(e[0])
    for e in evs:
        if e[1] == 'on' and (len(e) < 5 or e[4] > 0):
            tick, ch, pitch = e[0], e[2], e[3]
            off = None
            # 找同一 (ch,pitch) 的下一个 off
            for e2 in evs:
                if e2[1] == 'off' and e2[0] > tick and e2[2] == ch and e2[3] == pitch:
                    off = e2[0]; break
            if off is None: off = tick + 120
            rows.append((tick, ch, pitch, e[4] if len(e) > 4 else 100, off))
byc = collections.defaultdict(list)
for tick, ch, p, v, off in rows:
    byc[ch].append({'tick': tick, 'bar': tick // GRID + 1, 'beat': (tick % GRID)/480.0, 'm': p, 'v': v, 'dur': max(0.05, (off-tick)/480.0)})
print('rongns channels:')
for ch in sorted(byc):
    ns = byc[ch]
    poly = collections.Counter(n['tick'] for n in ns)
    print('  ch%2d n=%4d  %3d-%3d med%3d  poly%.2f  bars %3d-%3d' % (ch, len(ns), min(n['m'] for n in ns), max(n['m'] for n in ns),
        statistics.median([n['m'] for n in ns]), sum(1 for v in poly.values() if v>1)/max(1,len(poly)), min(n['bar'] for n in ns), max(n['bar'] for n in ns)))
print()
print('每 8 小节通道音数：')
chs = sorted(byc)
print('bars     ' + ' '.join('ch%2d' % c for c in chs))
for s in range(0, 120, 8):
    print('%3d-%3d ' % (s+1, s+8) + ' '.join('%4d' % sum(1 for n in byc[c] if s+1 <= n['bar'] <= s+8) for c in chs))
# tempo
import midi2js
print()
print('tempo events:', [(t, round(M2.tick_to_sec([{'tick':t,'sec':0,'tempo':v}], 480, t) if False else 0)) for t, v in []][:0])
