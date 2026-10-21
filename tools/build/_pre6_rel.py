# -*- coding: utf-8 -*-
# 检查 ch0 / ch3 关系；ch6/ch7/ch9/ch15 角色
import os, sys, collections
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '8 - Imperishable Night', '16. Voyage 1970 (ZUN).mid')
midi = M.parse_midi(MID)
chans, segs, div = M.extract_channels(midi)
def by_tick(ch):
    d = collections.defaultdict(list)
    for n in chans[ch]['notes']:
        d[n['t']].append(n['m'])
    return d
a, b = by_tick(0), by_tick(3)
common = set(a) & set(b)
print('ch0 时刻 %d, ch3 时刻 %d, 共同时刻 %d' % (len(a), len(b), len(common)))
diffs = collections.Counter()
for t in common:
    for m0 in a[t]:
        best = min(b[t], key=lambda m3: abs(m0 - m3))
        diffs[m0 - best] += 1
print('ch0 音 - 同刻 ch3 最近音 的差直方:', diffs.most_common(8))
extra = [len(set(a[t]) - set(b[t])) for t in common]
print('每时刻 ch0 比 ch3 多出的音数 平均 %.2f' % (sum(extra)/len(extra)))
# ch9 低音：每小节根音
q = 4.0 * div
def sec_of_bar(x): return M.tick_to_sec(segs, div, int(round(x * q)))
print()
for ch in (6, 7, 9, 15):
    ns = sorted(chans[ch]['notes'], key=lambda n: n['t'])
    print('ch%d 前 12 音:' % ch, [(round(sec_of_bar(1) and 0 + n['t']/ (q) * 0, 2), n['m'], round(n['d'],2)) for n in ns[:0]])
    print('ch%d 前 12 音(bar,m,d):' % ch, [(round(n['t'] / q, 2), n['m'], round(n['d'], 2)) for n in ns[:12]])
