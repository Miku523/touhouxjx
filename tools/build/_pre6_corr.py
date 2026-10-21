# -*- coding: utf-8 -*-
# refA 音频逐小节色度 vs MIDI 各通道逐小节色度：谁才是主旋律
import os, sys, json, math
import numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M

feat = json.load(open(os.path.join(ROOT, 'tools', 'build', '_pre6_features.json'), encoding='utf-8'))
ref = feat['refA']
BAR = ref['bar_sec']; OFF = ref['beat_offset']
audio = [b['chroma'] for b in ref['bars']]
print('音频 %d 小节, bar=%.4fs off=%.3fs' % (len(audio), BAR, OFF))

midi = M.parse_midi(os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                                 '8 - Imperishable Night', '16. Voyage 1970 (ZUN).mid'))
chans, segs, div = M.extract_channels(midi)

def midi_bars(ch, t_shift):
    out = {}
    for n in chans[ch]['notes']:
        b = int(math.floor((n['t'] - t_shift) / BAR))
        if b < 0: continue
        out.setdefault(b, np.zeros(12))
        out[b][n['m'] % 12] += n['d'] * n['v']
    return out

def norm(v):
    s = v.sum()
    return v / s if s else v

def corr(a, b):
    a = norm(np.array(a)); b = norm(np.array(b))
    if a.sum() == 0 or b.sum() == 0: return 0.0
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

best = []
for ch in (0, 3, 6, 7, 9, 15):
    for shift in np.arange(-2.0, 2.05, 0.5):
        mb = midi_bars(ch, shift)
        cs = [corr(audio[i], mb[i]) for i in range(len(audio)) if i in mb]
        if not cs: continue
        best.append((float(np.mean(cs)), ch, float(shift), len(cs)))
best.sort(reverse=True)
for m, ch, sh, n in best[:14]:
    print('ch%-2d shift %+.1f bar  corr %.3f  (n=%d)' % (ch, sh, m, n))
