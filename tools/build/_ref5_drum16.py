# -*- coding: utf-8 -*-
"""_ref5_drum16.py —— 鼓组细节：16 分网格上的底鼓/军鼓/踩镲分布、开镲、强击比。
时间分辨率 n_fft=512 / hop=128（fps≈344）。"""
import sys, os, json
import numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _ref5_lib as L

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = r'C:\Users\GuSheng\AppData\Local\Temp\aya_ref'
D = json.load(open(os.path.join(HERE, '_ref5_raw.json'), encoding='utf-8'))


def detail(x, sr, bpm, off):
    n_fft, hop = 512, 128
    win = np.hanning(n_fft).astype(np.float32)
    fr = L._frames(x, n_fft, hop)
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    masks = dict(kick=(freqs >= 30) & (freqs < 120),
                 snare=(freqs >= 150) & (freqs < 400),
                 hat=(freqs >= 6000) & (freqs < 16000))
    n = fr.shape[0]
    E = {k: np.zeros(n, np.float32) for k in masks}
    for i in range(0, n, 1024):
        m = np.abs(np.fft.rfft(fr[i:i + 1024] * win, axis=1)).astype(np.float32)
        for k, msk in masks.items():
            E[k][i:i + m.shape[0]] = m[:, msk].sum(1)
    fps = sr / hop
    t = np.arange(n) / fps
    beat = 60 / bpm
    e16 = beat / 4

    def peaks(env, k=2.0, gap=3):
        thr = np.median(env) + k * (env.std() + 1e-9)
        idx = np.where((env[1:-1] > env[:-2]) & (env[1:-1] >= env[2:]) &
                       (env[1:-1] > thr))[0] + 1
        keep = []
        for i in idx:
            if not keep or i - keep[-1] >= gap:
                keep.append(i)
        return np.array(keep)

    out = {}
    bars = (len(x) / sr - off) / (4 * beat)
    for k in masks:
        pk = peaks(E[k])
        if len(pk) == 0:
            out[k] = dict(n=0, per_bar=0.0, hist16=[0] * 16, beat_hist=[0] * 4, acc_ratio=0.0)
            continue
        tt = t[pk]
        hist = np.bincount(np.round(((tt - off) / e16) % 16).astype(int) % 16, minlength=16)
        amp = E[k][pk]
        out[k] = dict(n=int(len(pk)), per_bar=round(len(pk) / bars, 2),
                      hist16=[int(v) for v in hist],
                      beat_hist=[int(hist[i * 4:(i + 1) * 4].sum()) for i in range(4)],
                      acc_ratio=round(float((amp > np.percentile(amp, 85)).mean()), 2))
    hp = peaks(E['hat'])
    long_hat = 0
    for i in hp:
        j = min(n - 1, i + int(0.12 * fps))
        if E['hat'][j] > 0.35 * E['hat'][i]:
            long_hat += 1
    out['open_hat'] = round(long_hat / max(1, len(hp)), 2)
    out['hat16_density'] = round(float(out['hat']['per_bar'] / 16.0), 2)
    return out


sel = sys.argv[1:] or list(D)
res = {}
for nm in sel:
    d = D[nm]
    x, sr = L.load_mono(os.path.join(SRC, nm + '.mp3'))
    r = detail(x, sr, d['bpm'], d['beat_offset'])
    res[nm] = r
    print('=' * 90)
    print('%s  bpm %.1f  off %.3f' % (nm, d['bpm'], d['beat_offset']))
    for k in ('kick', 'snare', 'hat'):
        v = r[k]
        print('  %-5s 每小节 %.2f 次  16格 %s  拍 %s  强击比 %.2f' %
              (k, v['per_bar'], v['hist16'], v['beat_hist'], v['acc_ratio']))
    print('  开镲比例 %.2f' % r['open_hat'])
json.dump(res, open(os.path.join(HERE, '_ref5_drums.json'), 'w', encoding='utf-8'),
          ensure_ascii=False)
print('已写 _ref5_drums.json')
