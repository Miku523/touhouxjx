# -*- coding: utf-8 -*-
"""按 MIDI 的拍（tick/div）把主旋律映射到录音，拟合 拍->秒 的线性关系与移调"""
import os, sys, numpy as np, soundfile as sf
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
HERE = r'C:\Users\GuSheng\Downloads\HKS\tools'
sys.path.insert(0, HERE)
import midi2js as M

D = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex'
MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '6 - The Embodiment of Scarlet Devil', '13. Septette for a Dead Princess (ZUN).mid')
midi = M.parse_midi(MID)
div = midi['division'] or 480
print('division', div)

# 按 tick 配对音符（保留 tick）
notes = {}   # ch -> list of (on_tick, off_tick, pitch, vel)
pending = {}
for tr in midi['tracks']:
    for ev in tr['events']:
        if ev[1] == 'on' and ev[4] > 0:
            pending.setdefault((ev[2], ev[3]), []).append(ev[0])
        elif ev[1] == 'off':
            st = pending.get((ev[2], ev[3]))
            if st:
                on = st.pop(0)
                notes.setdefault(ev[2], []).append((on, max(ev[0], on+1), ev[3], 90))
lead = sorted(notes[3], key=lambda n: n[0])
print('ch3 音数', len(lead), '首 tick', lead[0][0], '末 tick', lead[-1][1])
beats = [n[0] / div for n in lead]
print('首拍 %.2f 末拍 %.2f' % (beats[0], beats[-1] / 1))

y, sr = sf.read(os.path.join(D, 'sept_mel.mp3'), dtype='float32', always_2d=True)
x = y.mean(1).astype(np.float32)
N = 4096; HOP = 512; win = np.hanning(N).astype(np.float32)
nf = (len(x) - N) // HOP + 1
S = np.empty((nf, N // 2 + 1), np.float32)
for i in range(nf):
    S[i] = np.abs(np.fft.rfft(x[i*HOP:i*HOP+N] * win))
S = S ** 2
freqs = np.fft.rfftfreq(N, 1.0/sr); fps = sr / HOP
def be(f):
    lo = f * 2 ** (-30/1200.0); hi = f * 2 ** (30/1200.0)
    m = (freqs >= lo) & (freqs <= hi)
    return S[:, m].sum(1) if m.any() else np.zeros(nf)

best = None
for dlt in range(-4, 5):
    for bps in np.arange(0.36, 0.50, 0.004):   # 秒/拍
        for a in np.arange(0.0, 4.0, 0.1):
            tot = 0.0
            for on, offt, m, v in lead[:120]:
                t = a + (on / div) * bps
                if t < 0.15 or t > len(x)/sr - 0.3: continue
                f0 = int(t * fps)
                f = 440.0 * 2 ** ((m + dlt - 69) / 12.0)
                e = be(f)
                tot += float(np.max(e[max(0, f0-3):f0+4]))
            if best is None or tot > best[0]:
                best = (tot, dlt, bps, a)
print('拟合：移调 %+d 秒/拍 %.4f (=%.1f BPM) 起点 %.2fs 能量 %.3g' % (best[1], best[2], 60/best[2], best[3], best[0]))
