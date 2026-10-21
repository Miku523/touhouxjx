# -*- coding: utf-8 -*-
# refA 逐小节 RMS vs MIDI 逐小节音符密度（找对齐）
import os, sys, json, math
import numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
feat = json.load(open(os.path.join(ROOT, 'tools', 'build', '_pre6_features.json'), encoding='utf-8'))
ref = feat['refA']; BAR = ref['bar_sec']
rms = [b['rms'] for b in ref['bars']]
print('refA 小节 RMS:')
for i in range(0, len(rms), 8):
    print(' %2d: %s' % (i, ' '.join('%.3f' % x for x in rms[i:i+8])))

midi = M.parse_midi(os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                                 '8 - Imperishable Night', '16. Voyage 1970 (ZUN).mid'))
chans, segs, div = M.extract_channels(midi)
tot = {}
for ch in chans:
    for n in chans[ch]['notes']:
        b = int(math.floor(n['t'] / BAR))
        tot.setdefault(b, 0)
        tot[b] += 1
    # unused
print('MIDI 逐小节总音数:')
ks = sorted(tot)
for i in range(0, len(ks), 8):
    print(' %2d: %s' % (ks[i], ' '.join('%3d' % tot[k] for k in ks[i:i+8])))

def corr(a, b):
    a = np.array(a, float); b = np.array(b, float)
    if a.std() == 0 or b.std() == 0: return 0
    return float(np.corrcoef(a, b)[0, 1])

# 平滑后对齐
def smooth(x, k=2):
    return [sum(x[max(0,i-k):i+k+1]) / len(x[max(0,i-k):i+k+1]) for i in range(len(x))]
res = []
for shift in range(-4, 5):
    xs, ys = [], []
    for i in range(len(rms)):
        j = i - shift
        if j in tot:
            xs.append(rms[i]); ys.append(tot[j])
    if len(xs) > 20:
        res.append((corr(xs, ys), shift, len(xs)))
res.sort(reverse=True)
print('RMS vs 密度 相关:', [('%.3f' % c, s, n) for c, s, n in res[:6]])
