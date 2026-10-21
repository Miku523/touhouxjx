# -*- coding: utf-8 -*-
"""把新版编曲与游戏内 8bit 原曲「融合」成一个试听稿。

做法不是两首整轨相加（原曲贝斯和新版贝斯经常差半音，低频会糊成一团），
而是**分工**：新版出鼓、贝斯、铺底、主旋律；原曲只出它的副旋律/和声层
（track0 square 0.15 的 ch0 主题 + track2 square 0.05 的副旋律），
这样既能听出「游戏那层味道」叠进来，又不会撞低频。
"""
import numpy as np
import soundfile as sf

BASE = r'C:\Users\GuSheng\Downloads\HKS'
sr = 44100


def render_track(js_data, ti, gain):
    """极简离线渲染：与 audio.js 同一套波形/包络参数，只渲染单轨。"""
    wave = js_data['tracks'][ti]['wave']
    n = int(js_data['duration'] * sr) + sr
    out = np.zeros(n)
    for (t, m, dur, vel) in js_data['tracks'][ti]['notes']:
        d = min(max(dur, 0.03), 4.0)
        f = 440.0 * 2 ** ((m - 69) / 12)
        ln = int(d * sr)
        if ln < 8:
            continue
        tt = np.arange(ln) / sr
        ph = (f * tt) % 1.0
        if wave == 'square':
            s = np.where(ph < 0.5, 1.0, -1.0)
        elif wave == 'triangle':
            s = 4 * np.abs(ph - 0.5) - 1.0
        elif wave == 'sawtooth':
            s = 2 * ph - 1.0
        else:
            s = np.sin(2 * np.pi * ph)
        amp = gain * (0.4 + 0.6 * vel / 127)
        env = np.exp(-tt / max(d * 0.3, 0.01))
        i0 = int(t * sr)
        seg = s * amp * env
        out[i0:i0 + ln] += seg[:max(0, min(ln, n - i0))]
    return out


import json
old = json.load(open(BASE + r'\tools\build\_old_stage4.json', encoding='utf-8'))
print('原曲轨:', [(i, tr['wave'], tr['gain'], len(tr['notes'])) for i, tr in enumerate(old['tracks'])])

new_wav, _ = sf.read(BASE + r'\tools\build\aya_fb_raw.wav', always_2d=True)
new = new_wav[:, 0]
n = len(new)

# 原曲的两层旋律：主奏(ch0 主题) + 副旋律；缩放系数用来配到合适响度
layer = render_track(old, 0, 0.15) * 0.55 + render_track(old, 2, 0.05) * 0.75
layer = layer[:n] if len(layer) >= n else np.pad(layer, (0, n - len(layer)))

out = np.zeros(n)
out += new
mix_end = min(n, len(layer))
out[:mix_end] += layer[:mix_end]
peak = np.abs(out).max()
if peak > 0.95:
    out *= 0.95 / peak
sf.write(BASE + r'\tools\build\aya_fusion_melody.wav', out, sr)
print('融合稿 长度 %.1fs  peak %.3f  rms %.4f' % (len(out) / sr, np.abs(out).max(), float(np.sqrt((out ** 2).mean()))))
