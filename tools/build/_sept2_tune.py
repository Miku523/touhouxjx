# -*- coding: utf-8 -*-
"""用原曲录音仲裁：MIDI 主旋律的音高与时间对齐（每个音在原曲里的频谱能量）"""
import os, sys, numpy as np, soundfile as sf
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
HERE = r'C:\Users\GuSheng\Downloads\HKS\tools'
sys.path.insert(0, HERE)
import midi2js as M

D = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex'
MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '6 - The Embodiment of Scarlet Devil', '13. Septette for a Dead Princess (ZUN).mid')
y, sr = sf.read(os.path.join(D, 'sept_mel.mp3'), dtype='float32', always_2d=True)
x = y.mean(1).astype(np.float32)

N = 4096; HOP = 512
win = np.hanning(N).astype(np.float32)
nf = (len(x) - N) // HOP + 1
S = np.empty((nf, N // 2 + 1), np.float32)
for i in range(nf):
    S[i] = np.abs(np.fft.rfft(x[i*HOP:i*HOP+N] * win))
S = S ** 2
freqs = np.fft.rfftfreq(N, 1.0 / sr)
fps = sr / HOP
print('STFT', S.shape)

def band_energy(f, dur=0.12):
    lo = f * 2 ** (-30/1200.0); hi = f * 2 ** (30/1200.0)
    m = (freqs >= lo) & (freqs <= hi)
    return S[:, m].sum(1) if m.any() else np.zeros(nf)

chans, segs, div = M.extract_channels(M.parse_midi(MID))
alln = [n for c in chans.values() for n in c['notes']]
off = min(n['t'] for n in alln)
lead = sorted(chans[3]['notes'], key=lambda n: n['t'])

best = None
for dlt in range(-3, 4):
    for sh in np.arange(-4.0, 0.01, 0.05):
        tot = 0.0
        for n in lead:
            t = n['t'] - off + sh
            if t < 0.2 or t > len(x)/sr - 0.3:
                continue
            f0 = int(t * fps)
            f = 440.0 * 2 ** ((n['m'] + dlt - 69) / 12.0)
            e = band_energy(f)
            tot += float(np.max(e[max(0, f0-3):f0+4]))
        if best is None or tot > best[0]:
            best = (tot, dlt, float(sh))
print('最佳：移调 %+d 半音  shift %+.2fs  总能量 %.3g' % (best[1], best[2], best[0]))

# 最佳参数下逐音比对：m 与 m±1 谁强
dlt, sh = best[1], best[2]
wins = []
for n in lead:
    t = n['t'] - off + sh
    if t < 0.2 or t > len(x)/sr - 0.3:
        continue
    f0 = int(t * fps)
    es = []
    for dd in (-1, 0, 1):
        f = 440.0 * 2 ** ((n['m'] + dlt + dd - 69) / 12.0)
        e = band_energy(f)
        es.append(float(np.max(e[max(0, f0-3):f0+4])))
    wins.append((es[1]/ (es[0]+es[1]+es[2]+1e-12), n['m'], round(t, 2)))
print('中心音占优比例（m 强于 m±1）: %.2f' % np.mean([w[0] > 0.42 for w in wins]))
bad = sorted(wins)[:10]
print('最可疑的 10 个音:', [(m, t, round(p,2)) for p, m, t in bad])
