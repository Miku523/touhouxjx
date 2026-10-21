# -*- coding: utf-8 -*-
import sys, os, numpy as np, json
sys.path.insert(0, os.path.join(os.getcwd(), 'tools', 'build'))
import _ref5_lib as L

xr, sr = L.load_mono(r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex\tepes_zun.mp3')
OFF = 57.44

# 从生成器拿到主旋律（用 python 直接解析 JS 太重，改用 CLI 输出 JSON 的办法：先跑一个 node 存 json）
lead = json.load(open('tools/build/_ex_lead.json'))
print('lead notes', len(lead))

def band_energy(x, sr, t, dur, f, bw=0.03):
    i0 = int(t * sr); i1 = int((t + dur) * sr)
    seg = x[i0:i1]
    if len(seg) < 256: return 0.0
    w = np.hanning(len(seg))
    mag = np.abs(np.fft.rfft(seg * w))
    freqs = np.fft.rfftfreq(len(seg), 1.0 / sr)
    m = (freqs > f * (1 - bw)) & (freqs < f * (1 + bw))
    return float(mag[m].max()) if m.any() else 0.0

def hz(m): return 440.0 * 2 ** ((m - 69) / 12.0)

bad = []
for t, m, d in lead:
    tt = t + OFF
    if tt + 0.12 > len(xr) / sr: continue
    dur = min(0.16, max(0.08, d * 0.8))
    e0 = band_energy(xr, sr, tt + 0.02, dur, hz(m))
    em = band_energy(xr, sr, tt + 0.02, dur, hz(m - 1))
    ep = band_energy(xr, sr, tt + 0.02, dur, hz(m + 1))
    # 也看八度（低八度/高八度）
    elo = band_energy(xr, sr, tt + 0.02, dur, hz(m - 12))
    ehi = band_energy(xr, sr, tt + 0.02, dur, hz(m + 12))
    best = max((e0, 'same'), (em, 'down1'), (ep, 'up1'), (elo, 'down12'), (ehi, 'up12'))
    rel = e0 / (max(em, ep) + 1e-9)
    if best[1] != 'same':
        bad.append((round(t,2), m, best[1], round(rel,2)))
rel_all = []
for t, m, d in lead:
    tt = t + OFF
    if tt + 0.12 > len(xr)/sr: continue
    dur = min(0.16, max(0.08, d * 0.8))
    e0 = band_energy(xr, sr, tt + 0.02, dur, hz(m))
    em = band_energy(xr, sr, tt + 0.02, dur, hz(m - 1))
    ep = band_energy(xr, sr, tt + 0.02, dur, hz(m + 1))
    if max(em, ep) > 1e-9: rel_all.append(e0 / max(em, ep))
rel_all = np.array(rel_all)
print('notes checked', len(rel_all))
print('e0/(neighbor) 中位 %.2f  25%% %.2f  10%% %.2f' % (np.median(rel_all), np.percentile(rel_all,25), np.percentile(rel_all,10)))
print('可疑（邻音更强）%d 音:' % len(bad))
for b in bad[:40]: print('  t=%.2f m=%d -> %s rel=%.2f' % b)
